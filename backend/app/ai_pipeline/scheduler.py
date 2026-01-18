"""
PodNova Pipeline Scheduler
Automates the ingestion and clustering pipeline to run periodically
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME
from app.ai_pipeline.ingestion import ArticleIngestionService
from app.ai_pipeline.clustering import ClusteringService
import schedule
import time
from datetime import datetime
import sys

# Configuration
INGESTION_INTERVAL_MINUTES = 60  # Run ingestion every 60 minutes (1 hour)
CLUSTERING_DELAY_MINUTES = 5  # Run clustering 5 minutes after each ingestion


def run_ingestion():
    """Run the article ingestion pipeline"""
    print("\n" + "=" * 80)
    print(f"[SCHEDULER] Starting Ingestion Job")
    print(f"[SCHEDULER] Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    try:
        service = ArticleIngestionService(MONGODB_URI, MONGODB_DB_NAME)
        stats = service.run_ingestion()
        
        print(f"\n[SCHEDULER] Ingestion completed successfully")
        print(f"[SCHEDULER] Total articles ingested: {stats['total_ingested']}")
        print(f"[SCHEDULER] By category:")
        for category, count in stats['by_category'].items():
            print(f"[SCHEDULER]   - {category.capitalize()}: {count}")
        
    except Exception as e:
        print(f"[SCHEDULER] ERROR during ingestion: {str(e)}")
        import traceback
        traceback.print_exc()


def run_clustering():
    """Run the article clustering and topic generation pipeline"""
    print("\n" + "=" * 80)
    print(f"[SCHEDULER] Starting Clustering Job")
    print(f"[SCHEDULER] Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    try:
        service = ClusteringService(MONGODB_URI, MONGODB_DB_NAME)
        stats = service.process_pending_articles()
        service.mark_inactive_topics()
        
        print(f"\n[SCHEDULER] Clustering completed successfully")
        print(f"[SCHEDULER] Articles processed: {stats['total_processed']}")
        print(f"[SCHEDULER] New topics created: {stats['new_topics']}")
        print(f"[SCHEDULER] Existing topics updated: {stats['updated_topics']}")
        print(f"[SCHEDULER] Titles generated: {stats['titles_generated']}")
        
    except Exception as e:
        print(f"[SCHEDULER] ERROR during clustering: {str(e)}")
        import traceback
        traceback.print_exc()


def run_full_pipeline():
    """Run both ingestion and clustering sequentially (for startup)"""
    run_ingestion()
    print(f"\n[SCHEDULER] Pausing {CLUSTERING_DELAY_MINUTES} minutes before clustering...")
    time.sleep(CLUSTERING_DELAY_MINUTES * 60)
    run_clustering()


def run_ingestion_with_clustering():
    """Run ingestion followed by clustering after a delay"""
    # Run ingestion first
    run_ingestion()
    
    # Wait before clustering
    print(f"\n[SCHEDULER] Waiting {CLUSTERING_DELAY_MINUTES} minutes before clustering...")
    time.sleep(CLUSTERING_DELAY_MINUTES * 60)
    
    # Run clustering
    run_clustering()


def start_scheduler():
    """Start the automated scheduler"""
    print("=" * 80)
    print("PodNova Automated Pipeline Scheduler")
    print("=" * 80)
    print(f"Configuration:")
    print(f"  Pipeline runs every {INGESTION_INTERVAL_MINUTES} minutes")
    print(f"  Clustering runs {CLUSTERING_DELAY_MINUTES} minutes after ingestion")
    print(f"  Database: {MONGODB_DB_NAME}")
    print(f"  Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print("\nSchedule:")
    print(f"  Every hour:")
    print(f"    - XX:00 → Run ingestion")
    print(f"    - XX:0{CLUSTERING_DELAY_MINUTES} → Run clustering")
    print("\nPress Ctrl+C to stop the scheduler")
    print("=" * 80 + "\n")
    
    # Schedule the combined job
    schedule.every(INGESTION_INTERVAL_MINUTES).minutes.do(run_ingestion_with_clustering)
    
    # Run immediately on startup
    print("[SCHEDULER] Running initial full pipeline...")
    run_full_pipeline()
    
    print("\n" + "=" * 80)
    print("[SCHEDULER] Initial pipeline complete. Now running on schedule...")
    print("=" * 80 + "\n")
    
    # Keep running scheduled jobs
    try:
        while True:
            schedule.run_pending()
            time.sleep(30)  # Check every 30 seconds
    except KeyboardInterrupt:
        print("\n" + "=" * 80)
        print("[SCHEDULER] Shutdown signal received")
        print("[SCHEDULER] Stopping gracefully...")
        print("=" * 80)
        sys.exit(0)


def main():
    """Main entry point"""
    start_scheduler()


if __name__ == "__main__":
    main()