from sqlmodel import SQLModel, create_engine, Session, select
from settings import settings
from models import Node, Edge, ActionRecord

engine = create_engine(settings.sqlite_url, echo=False, connect_args={"check_same_thread": False})

def init_db():
    SQLModel.metadata.create_all(engine)

def get_session():
    return Session(engine)

def upsert_node(url: str, title: str | None, origin: str | None):
    with get_session() as s:
        stmt = select(Node).where(Node.url == url)
        res = s.exec(stmt).first()
        if res:
            if title: res.title = title
            s.add(res); s.commit(); s.refresh(res)
            return res
        node = Node(url=url, title=title, origin=origin)
        s.add(node); s.commit(); s.refresh(node)
        return node

def add_edge(from_node_id: int, to_node_id: int, via_selector: str | None):
    with get_session() as s:
        e = Edge(from_node_id=from_node_id, to_node_id=to_node_id, via_selector=via_selector)
        s.add(e); s.commit(); s.refresh(e)
        return e

def record_action(node_id: int | None, action_type: str, selector: str | None, text: str | None, success: bool):
    with get_session() as s:
        r = ActionRecord(node_id=node_id, action_type=action_type, selector=selector, text=text, success=success)
        s.add(r); s.commit(); s.refresh(r)
        return r
