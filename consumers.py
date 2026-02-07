from modules.worker import WorkerPool


class ConsumerManager:
    def __init__(self, workers=3):
        self._started = False
        self._pool = WorkerPool(workers)

    async def start(self):
        if self._started:
            return
        await self._pool.start()
        self._started = True

    async def stop(self):
        if not self._started:
            return
        await self._pool.stop()
        self._started = False


from modules.logger import logger
import signal, functools


# should be a cli command
async def start_consumers(workers=3):
    consumer = ConsumerManager(workers)
    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    def signal_handler(sig):
        logger.warning(f"Signal {sig.name} received, initiating shutdown...")
        shutdown_event.set()

    for s in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(s, functools.partial(signal_handler, s))

    try:
        await consumer.start()
        await shutdown_event.wait()
    finally:
        await consumer.stop()
        logger.info("Consumers stopped.")


if __name__ == "__main__":
    import asyncio

    asyncio.run(start_consumers())
