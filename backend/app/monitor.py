"""
Thread pool monitor for tracking blocking operations
"""
import threading

class ThreadPoolMonitor:
    def __init__(self):
        self.active_threads = 0
        self.max_threads = 0
        self.lock = threading.Lock()
    
    def start_task(self):
        with self.lock:
            self.active_threads += 1
            self.max_threads = max(self.max_threads, self.active_threads)
    
    def end_task(self):
        with self.lock:
            self.active_threads -= 1
    
    def get_stats(self):
        with self.lock:
            return {
                "active_threads": self.active_threads,
                "max_concurrent": self.max_threads,
                "total_threads": threading.active_count()
            }

# Create global monitor instance
thread_monitor = ThreadPoolMonitor()