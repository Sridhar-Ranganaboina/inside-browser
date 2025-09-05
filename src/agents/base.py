class Agent:
    name: str = "base"
    description: str = "Base agent"

    async def run(self, context: dict):
        raise NotImplementedError("Agent must implement run()")
