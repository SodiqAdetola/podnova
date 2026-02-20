# backend/app/ai_pipeline/scheduler.py
"""
PodNova Automated Scheduler
FULLY ASYNC VERSION
"""
import asyncio
import signal
from datetime import datetime, timedelta
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


class PodNovaScheduler:
    def __init__(self):
        """Initialize all services"""
        self.ingestion_service = ArticleIngestionService(MONGODB_URI, MONGODB_DB_NAME)
        self.clustering_service = ClusteringService(MONGODB_URI, MONGODB_DB_NAME)
        self.maintenance_service = MaintenanceService(MONGODB_URI, MONGODB_DB_NAME)
        self.history_service = TopicHistoryService(MONGODB_URI, MONGODB_DB_NAME)
        
        self.running = True
        self.tasks = []
        
        # Schedule intervals (in seconds)
        self.INGESTION_INTERVAL = 4 * 3600  # 4 hours
        self.CLUSTERING_INTERVAL = 2 * 3600  # 2 hours
        self.HISTORY_INTERVAL = 3 * 3600  # 3 hours
        self.LIGHT_MAINTENANCE_INTERVAL = 6 * 3600  # 6 hours
        
        # Track last run times
        self.last_ingestion = datetime.min
        self.last_clustering = datetime.min
        self.last_history = datetime.min
        self.last_light_maintenance = datetime.min
        self.last_full_maintenance = datetime.min
    
    async def run_ingestion(self):
        """Scheduled ingestion job"""
        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Article Ingestion")
            logger.info("=" * 80)
            stats = await self.ingestion_service.run_ingestion()
            logger.info(f"Ingestion completed: {stats['total_ingested']} articles")
            self.last_ingestion = datetime.now()
        except Exception as e:
            logger.error(f"Ingestion failed: {str(e)}", exc_info=True)
    
    async def run_clustering(self):
        """Scheduled clustering job"""
        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Article Clustering")
            logger.info("=" * 80)
            
            stats = await self.clustering_service.process_pending_articles()
            await self.clustering_service.mark_inactive_topics()
            
            logger.info(f"Clustering completed: {stats['total_processed']} articles processed")
            self.last_clustering = datetime.now()
            
        except Exception as e:
            logger.error(f"Clustering failed: {str(e)}", exc_info=True)
    
    async def run_history_check(self):
        """Scheduled history check job"""
        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Topic History Check")
            logger.info("=" * 80)
            
            stats = await self.history_service.run_history_check_cycle()
            
            logger.info(f"History check completed: {stats['histories_created']} history points created")
            self.last_history = datetime.now()
            
        except Exception as e:
            logger.error(f"History check failed: {str(e)}", exc_info=True)
    
    async def run_full_maintenance(self):
        """Full maintenance job - daily at 3 AM"""
        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Full Database Maintenance")
            logger.info("=" * 80)
            
            stats = await self.maintenance_service.run_full_maintenance()
            
            logger.info(f"Full maintenance completed")
            self.last_full_maintenance = datetime.now()
            
        except Exception as e:
            logger.error(f"Full maintenance failed: {str(e)}", exc_info=True)
    
    async def run_light_maintenance(self):
        """Light maintenance - just trim topics"""
        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Light Maintenance")
            logger.info("=" * 80)
            
            # Trim oversized topics
            active_topics = []
            cursor = self.maintenance_service.topics_collection.find({"status": "active"})
            async for topic in cursor:
                active_topics.append(topic)
            
            trimmed = 0
            for topic in active_topics:
                result = await self.maintenance_service.trim_topic_articles(topic["_id"])
                if result.get("trimmed", 0) > 0:
                    trimmed += 1
            
            logger.info(f"Light maintenance: {trimmed} topics trimmed")
            self.last_light_maintenance = datetime.now()
            
        except Exception as e:
            logger.error(f"Light maintenance failed: {str(e)}", exc_info=True)
    
    async def check_and_run_jobs(self):
        """Check if it's time to run scheduled jobs"""
        now = datetime.now()
        
        # Check ingestion
        if (now - self.last_ingestion).total_seconds() >= self.INGESTION_INTERVAL:
            self.tasks.append(asyncio.create_task(self.run_ingestion()))
        
        # Check clustering
        if (now - self.last_clustering).total_seconds() >= self.CLUSTERING_INTERVAL:
            self.tasks.append(asyncio.create_task(self.run_clustering()))
        
        # Check history
        if (now - self.last_history).total_seconds() >= self.HISTORY_INTERVAL:
            self.tasks.append(asyncio.create_task(self.run_history_check()))
        
        # Check light maintenance
        if (now - self.last_light_maintenance).total_seconds() >= self.LIGHT_MAINTENANCE_INTERVAL:
            self.tasks.append(asyncio.create_task(self.run_light_maintenance()))
        
        # Check for full maintenance (daily at 3 AM)
        if now.hour == 3 and now.minute == 0:
            if (now - self.last_full_maintenance).total_seconds() > 3600:  # Only once per day
                self.tasks.append(asyncio.create_task(self.run_full_maintenance()))
        
        # Clean up completed tasks
        self.tasks = [t for t in self.tasks if not t.done()]
    
    async def shutdown(self, sig=None):
        """Graceful shutdown"""
        logger.info("Shutting down scheduler...")
        self.running = False
        
        # Cancel all pending tasks
        for task in self.tasks:
            task.cancel()
        
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
        
        # Close all database connections
        await self.ingestion_service.close()
        await self.clustering_service.close()
        await self.maintenance_service.close()
        await self.history_service.close()
        
        logger.info("Scheduler stopped")
    
    async def run_initial_jobs(self):
        """Run initial jobs on startup"""
        logger.info("\nRunning initial jobs on startup...")
        
        # Run ingestion first
        await self.run_ingestion()
        await asyncio.sleep(60)
        
        # Run clustering
        await self.run_clustering()
        await asyncio.sleep(30)
        
        # Run history check
        await self.run_history_check()
    
    async def start(self):
        """Start the scheduler"""
        # Set up signal handlers for graceful shutdown
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, lambda: asyncio.create_task(self.shutdown(sig)))
        
        logger.info("=" * 80)
        logger.info("PodNova Scheduler Starting (FULLY ASYNC)")
        logger.info(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("=" * 80)
        
        logger.info("\nScheduled Jobs:")
        logger.info(f"  • Ingestion: Every {self.INGESTION_INTERVAL/3600} hours")
        logger.info(f"  • Clustering: Every {self.CLUSTERING_INTERVAL/3600} hours")
        logger.info(f"  • History Check: Every {self.HISTORY_INTERVAL/3600} hours")
        logger.info(f"  • Light Maintenance: Every {self.LIGHT_MAINTENANCE_INTERVAL/3600} hours")
        logger.info(f"  • Full Maintenance: Daily at 3:00 AM")
        
        # Run initial jobs
        await self.run_initial_jobs()
        
        logger.info("\nScheduler running. Press Ctrl+C to stop.")
        logger.info("=" * 80)
        
        # Main loop
        try:
            while self.running:
                await self.check_and_run_jobs()
                await asyncio.sleep(60)  # Check every minute
        except asyncio.CancelledError:
            pass
        finally:
            await self.shutdown()


async def main():
    """Entry point"""
    scheduler = PodNovaScheduler()
    await scheduler.start()


if __name__ == "__main__":
    asyncio.run(main())