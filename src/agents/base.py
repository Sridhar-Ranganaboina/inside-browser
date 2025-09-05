class Agent:
    name: str = "base"
    description: str = ""

    async def run(self, context: dict):
        raise NotImplementedError
