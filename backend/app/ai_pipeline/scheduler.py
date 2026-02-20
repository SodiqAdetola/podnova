# backend/app/ai_pipeline/scheduler.py
"""
PodNova Automated Scheduler
NOW WITH TOPIC HISTORY TRACKING
"""
import schedule
import time
from datetime import datetime
import logging
import asyncio

from app.ai_pipeline.ingestion import ArticleIngestionService
from app.ai_pipeline.clustering import ClusteringService
from app.ai_pipeline.article_maintenance import MaintenanceService
from app.ai_pipeline.topic_history import TopicHistoryService
from app.config import MONGODB_URI, MONGODB_DB_NAME

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
        self.ingestion_service = ArticleIngestionService(MONGODB_URI, MONGODB_DB_NAME)
        self.clustering_service = ClusteringService(MONGODB_URI, MONGODB_DB_NAME)
        self.maintenance_service = MaintenanceService(MONGODB_URI, MONGODB_DB_NAME)
        self.history_service = TopicHistoryService(MONGODB_URI, MONGODB_DB_NAME)  # ✅ NEW
    
    def run_ingestion(self):
        """Scheduled ingestion job"""
        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Article Ingestion")
            logger.info("=" * 80)
            stats = self.ingestion_service.run_ingestion()
            logger.info(f"Ingestion completed: {stats['total_ingested']} articles")
        except Exception as e:
            logger.error(f"Ingestion failed: {str(e)}", exc_info=True)
    
    def run_clustering(self):
        """Scheduled clustering job"""
        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Article Clustering")
            logger.info("=" * 80)
            
            # Run clustering (async)
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            stats = loop.run_until_complete(self.clustering_service.process_pending_articles())
            loop.run_until_complete(self.clustering_service.mark_inactive_topics())
            loop.close()
            
            logger.info(f"Clustering completed: {stats['total_processed']} articles processed")
            
        except Exception as e:
            logger.error(f"Clustering failed: {str(e)}", exc_info=True)
    
    def run_history_check(self):
        """✅ NEW: Scheduled history check job"""
        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Topic History Check")
            logger.info("=" * 80)
            
            # Run history check (async)
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            stats = loop.run_until_complete(self.history_service.run_history_check_cycle())
            loop.close()
            
            logger.info(f"History check completed: {stats['histories_created']} history points created")
            
        except Exception as e:
            logger.error(f"History check failed: {str(e)}", exc_info=True)
    
    def run_maintenance(self):
        """Scheduled maintenance job"""
        try:
            logger.info("=" * 80)
            logger.info("SCHEDULED JOB: Database Maintenance")
            logger.info("=" * 80)
            stats = self.maintenance_service.run_full_maintenance()
            logger.info(f"Maintenance completed: {stats['topics_trimmed']} topics trimmed, "
                       f"{stats['articles_cleaned']['archived']} articles archived")
        except Exception as e:
            logger.error(f"Maintenance failed: {str(e)}", exc_info=True)
    
    def run_light_maintenance(self):
        """Light maintenance - just trim topics"""
        try:
            logger.info("Light maintenance: Trimming oversized topics")
            active_topics = list(self.maintenance_service.topics_collection.find({"status": "active"}))
            trimmed = 0
            for topic in active_topics:
                result = self.maintenance_service.trim_topic_articles(topic["_id"])
                if result.get("trimmed", 0) > 0:
                    trimmed += 1
            logger.info(f"Light maintenance: {trimmed} topics trimmed")
        except Exception as e:
            logger.error(f"Light maintenance failed: {str(e)}", exc_info=True)
    
    def setup_schedule(self):
        """Configure all scheduled jobs"""
        
        # INGESTION: Every 4 hours
        schedule.every(4).hours.do(self.run_ingestion)
        logger.info("Scheduled: Ingestion every 4 hours")
        
        # CLUSTERING: Every 2 hours
        # Note: Clustering now includes inline history checks when topics are updated
        schedule.every(2).hours.do(self.run_clustering)
        logger.info("Scheduled: Clustering every 2 hours")
        
        # ✅ NEW: HISTORY CHECK: Every 3 hours
        # This catches topics that weren't updated during clustering
        schedule.every(3).hours.do(self.run_history_check)
        logger.info("Scheduled: History check every 3 hours")
        
        # LIGHT MAINTENANCE: Every 6 hours
        schedule.every(6).hours.do(self.run_light_maintenance)
        logger.info("Scheduled: Light maintenance every 6 hours")
        
        # FULL MAINTENANCE: Daily at 3 AM
        schedule.every().day.at("03:00").do(self.run_maintenance)
        logger.info("Scheduled: Full maintenance daily at 3:00 AM")
        
        # Run initial jobs on startup
        logger.info("\nRunning initial jobs on startup...")
        self.run_ingestion()
        time.sleep(60)
        self.run_clustering()
        time.sleep(30)
        self.run_history_check()  # ✅ NEW
    
    def start(self):
        """Start the scheduler"""
        logger.info("=" * 80)
        logger.info("PodNova Scheduler Starting (WITH HISTORY TRACKING)")
        logger.info(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("=" * 80)
        
        self.setup_schedule()
        
        logger.info("\nScheduler running. Press Ctrl+C to stop.")
        logger.info("=" * 80)
        
        try:
            while True:
                schedule.run_pending()
                time.sleep(60)
        except KeyboardInterrupt:
            logger.info("\nScheduler stopped by user")
        except Exception as e:
            logger.error(f"Scheduler error: {str(e)}", exc_info=True)


def main():
    """Entry point for scheduler"""
    scheduler = PodNovaScheduler()
    scheduler.start()


if __name__ == "__main__":
    main()