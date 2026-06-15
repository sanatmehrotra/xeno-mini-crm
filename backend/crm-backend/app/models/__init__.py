"""
Import all ORM models here so Alembic autogenerate can discover them
via Base.metadata.
"""

from app.models.customer import Customer  # noqa: F401
from app.models.order import Order  # noqa: F401
from app.models.segment import Segment, SegmentMember  # noqa: F401
from app.models.campaign import Campaign  # noqa: F401
from app.models.communication import Communication, CommunicationEvent  # noqa: F401
from app.models.ai_conversation import AIConversation  # noqa: F401
