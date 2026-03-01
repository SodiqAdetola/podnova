# backend/app/ai_pipeline/scheduler.py
"""
PodNova Automated Scheduler
FULLY ASYNC VERSION - SEQUENTIAL PIPELINE
Protects against concurrent task overlapping and race conditions.
"""
import asyncio
import signal
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import logging

from app.ai_pipeline.ingestion import ArticleIngestionService
from app.ai_pipeline.clustering import ClusteringService
from app.ai_pipeline.article_maintenance import MaintenanceService
from app.ai_pipeline.topic_history import TopicHistoryService
from app.config import MONGODB_URI, MONGODB_DB_NAME

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('podnova_scheduler.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Timezone Configuration
UK_TZ = ZoneInfo("Europe/London")

class PodNovaScheduler:
    def __init__(self):
        """Initialize all services"""
        self.ingestion_service = ArticleIngestionService(MONGODB_URI, MONGODB_DB_NAME)
        self.clustering_service = ClusteringService(MONGODB_URI, MONGODB_DB_NAME)
        self.maintenance_service = MaintenanceService(MONGODB_URI, MONGODB_DB_NAME)
        self.history_service = TopicHistoryService(MONGODB_URI, MONGODB_DB_NAME)
        
        self.running = True
        self.active_tasks = set()
        
        # Lock flags to prevent fork-bombing
        self.is_pipeline_running = False
        self.is_maintenance_running = False
        
        # Schedule intervals
        self.PIPELINE_INTERVAL_HOURS = 4
        self.LIGHT_MAINTENANCE_INTERVAL_HOURS = 6
        
        # Track last run times (Initialize to the past to force immediate start)
        past_date = datetime.now(UK_TZ) - timedelta(days=999)
        self.last_pipeline = past_date
        self.last_light_maintenance = past_date
        self.last_full_maintenance = past_date
    
    async def run_core_pipeline(self):
        """
        SEQUENTIAL PIPELINE: Ingestion -> Clustering -> History
        Ensures data flows logically and prevents race conditions.
        """
        if self.is_pipeline_running:
            logger.warning("Pipeline is already running. Skipping this trigger.")
            return

        self.is_pipeline_running = True
        self.last_pipeline = datetime.now(UK_TZ) # Update immediately to reset timer

        try:
            # 1. INGESTION
            logger.info("=" * 80)
            logger.info("PIPELINE STEP 1: Article Ingestion")
            logger.info("=" * 80)
            ingest_stats = await self.ingestion_service.run_ingestion()
            logger.info(f"Ingestion completed: {ingest_stats['total_ingested']} articles")
            
            # 2. CLUSTERING
            logger.info("=" * 80)
            logger.info("PIPELINE STEP 2: Article Clustering")
            logger.info("=" * 80)
            cluster_stats = await self.clustering_service.process_pending_articles()
            await self.clustering_service.mark_inactive_topics()
            logger.info(f"Clustering completed: {cluster_stats['processed']} articles clustered")
            
            # 3. HISTORY CHECK
            logger.info("=" * 80)
            logger.info("PIPELINE STEP 3: Topic History Check")
            logger.info("=" * 80)
            history_stats = await self.history_service.run_history_check_cycle()
            logger.info(f"History completed: {history_stats['histories_created']} snapshots created")

        except Exception as e:
            logger.error(f"Core Pipeline failed: {str(e)}", exc_info=True)
        finally:
            self.is_pipeline_running = False
            logger.info("Core Pipeline Run Complete.")

    async def run_full_maintenance(self):
        """Full maintenance job - daily at 3 AM"""
        if self.is_maintenance_running:
            return

        self.is_maintenance_running = True
        self.last_full_maintenance = datetime.now(UK_TZ)

        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Full Database Maintenance")
            logger.info("=" * 80)
            await self.maintenance_service.run_full_maintenance()
            logger.info("Full maintenance completed")
        except Exception as e:
            logger.error(f"Full maintenance failed: {str(e)}", exc_info=True)
        finally:
            self.is_maintenance_running = False
    
    async def run_light_maintenance(self):
        """Light maintenance - just trim oversized topics"""
        if self.is_maintenance_running:
            return

        self.is_maintenance_running = True
        self.last_light_maintenance = datetime.now(UK_TZ)

        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Light Maintenance")
            logger.info("=" * 80)
            
            # FIXED: Stream cursor to save RAM
            trimmed = 0
            cursor = self.maintenance_service.topics_collection.find({"status": "active"})
            async for topic in cursor:
                result = await self.maintenance_service.trim_topic_articles(str(topic["_id"]))
                if result.get("trimmed", 0) > 0:
                    trimmed += 1
            
            logger.info(f"Light maintenance: {trimmed} topics trimmed")
        except Exception as e:
            logger.error(f"Light maintenance failed: {str(e)}", exc_info=True)
        finally:
            self.is_maintenance_running = False
    
    async def check_and_run_jobs(self):
        """Check if it's time to run scheduled jobs based on UK time"""
        now = datetime.now(UK_TZ)
        
        # Check Pipeline (Ingestion -> Clustering -> History)
        if (now - self.last_pipeline).total_seconds() >= (self.PIPELINE_INTERVAL_HOURS * 3600):
            task = asyncio.create_task(self.run_core_pipeline())
            self.active_tasks.add(task)
            task.add_done_callback(self.active_tasks.discard)
        
        # Check light maintenance
        if (now - self.last_light_maintenance).total_seconds() >= (self.LIGHT_MAINTENANCE_INTERVAL_HOURS * 3600):
            task = asyncio.create_task(self.run_light_maintenance())
            self.active_tasks.add(task)
            task.add_done_callback(self.active_tasks.discard)
        
        # Check for full maintenance (daily at 3 AM UK Time)
        if now.hour == 3 and now.minute == 0:
            if (now - self.last_full_maintenance).total_seconds() > 3600:  # Only trigger once
                task = asyncio.create_task(self.run_full_maintenance())
                self.active_tasks.add(task)
                task.add_done_callback(self.active_tasks.discard)
    
    async def shutdown(self, sig=None):
        """Graceful shutdown"""
        logger.info(f"Received signal {sig}. Shutting down scheduler gracefully...")
        self.running = False
        
        # Wait for active tasks to finish (or cancel them if they take too long)
        if self.active_tasks:
            logger.info(f"Waiting for {len(self.active_tasks)} active jobs to complete...")
            await asyncio.gather(*self.active_tasks, return_exceptions=True)
        
        # Close all database connections and HTTP sessions
        await self.ingestion_service.close()
        await self.clustering_service.close()
        await self.maintenance_service.close()
        await self.history_service.close()
        
        logger.info("Scheduler stopped cleanly.")
    
    async def start(self):
        """Start the scheduler"""
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(self.shutdown(s)))
        
        logger.info("=" * 80)
        logger.info("PodNova Scheduler Starting (SEQUENTIAL PIPELINE)")
        logger.info(f"Time: {datetime.now(UK_TZ).strftime('%Y-%m-%d %H:%M:%S %Z')}")
        logger.info("=" * 80)
        
        logger.info("\nScheduled Jobs:")
        logger.info(f"  • Core Pipeline (Ingest->Cluster->History): Every {self.PIPELINE_INTERVAL_HOURS} hours")
        logger.info(f"  • Light Maintenance: Every {self.LIGHT_MAINTENANCE_INTERVAL_HOURS} hours")
        logger.info(f"  • Full Maintenance: Daily at 3:00 AM (UK Time)")
        logger.info("\nScheduler running. Press Ctrl+C to stop.")
        logger.info("=" * 80)
        
        try:
            while self.running:
                await self.check_and_run_jobs()
                await asyncio.sleep(60)  # Check the clock every 60 seconds
        except asyncio.CancelledError:
            pass
        finally:
            if self.running:  # Only call shutdown if not already called by signal
                await self.shutdown()

async def main():
    """Entry point"""
    scheduler = PodNovaScheduler()
    await scheduler.start()

if __name__ == "__main__":
    asyncio.run(main())