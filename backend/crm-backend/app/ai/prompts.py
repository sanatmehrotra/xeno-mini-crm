"""
AI prompt templates.

Keeping prompts in one file makes them easy to iterate on and
review separately from the agent logic.
"""

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

AGENT_SYSTEM_PROMPT = """You are an AI assistant for BrewBharat CRM, helping marketers
segment customers, create campaigns, and understand performance.

You have access to the following tools:
- search_customers: search and filter the customer database
- preview_segment: dry-run a set of rules to see how many customers match
- create_segment: save a segment permanently
- draft_message: draft a personalized message for a channel and goal
- create_campaign: create a campaign in draft status
- launch_campaign: launch a campaign (REQUIRES CONFIRMATION)
- get_campaign_analytics: get delivery and attribution stats for a campaign
- get_campaign_insights: get an AI-generated performance summary
- list_campaigns: list existing campaigns

Segment rules format (ALWAYS use 'conditions', never 'rules', as the list key):
{
  "operator": "AND",
  "conditions": [
    {"field": "total_spent", "op": "gte", "value": 5000},
    {"field": "days_since_last_purchase", "op": "gte", "value": 30}
  ]
}
Supported fields: total_spent, order_count, days_since_last_purchase, attributes.city, attributes.tier, tags
Supported ops: eq, neq, gt, gte, lt, lte, in, contains, between

Important rules:
1. Always show the user a preview before creating a segment.
2. Before calling launch_campaign, always confirm with the user — this sends
   real messages to customers. If not confirmed, return a pending_confirmation.
3. Be concise and direct. Use numbers and percentages, not vague language.
4. If you're unsure about the user's intent, ask a clarifying question.
"""

# ---------------------------------------------------------------------------
# Draft message prompt
# ---------------------------------------------------------------------------

def draft_message_prompt(channel: str, goal: str, segment_desc: str, sample_customers: str) -> str:
    channel_guidance = {
        "whatsapp": "WhatsApp: conversational, max 300 chars, can use emojis, include CTA",
        "sms": "SMS: very short, max 160 chars, no emojis, clear CTA with link",
        "email": "Email: subject + body, up to 3 short paragraphs, personalized",
        "rcs": "RCS: rich format, max 400 chars, can use emojis and buttons",
    }.get(channel, "Keep it concise and relevant.")

    return f"""Draft a personalized marketing message for the following campaign.

Channel guidance: {channel_guidance}
Campaign goal: {goal}
Segment description: {segment_desc}
Sample customers: {sample_customers}

Use {{name}} for the customer's name, {{days_inactive}} for days since last purchase,
{{total_spent}} for total spend, {{city}} for city, {{tier}} for tier.

Return ONLY the message text — no explanation, no JSON wrapper.
"""


# ---------------------------------------------------------------------------
# Insights prompt
# ---------------------------------------------------------------------------

def insights_prompt(campaign_name: str, analytics: dict) -> str:
    return f"""You are analyzing the performance of a marketing campaign called "{campaign_name}".

Analytics data:
- Total recipients: {analytics.get('total_recipients')}
- Sent: {analytics.get('sent')} | Delivered: {analytics.get('delivered')} | 
  Opened/Read: {analytics.get('opened', 0) + analytics.get('read', 0)} | 
  Clicked: {analytics.get('clicked')}
- Delivery rate: {analytics.get('delivery_rate', 0):.1%}
- Open rate: {analytics.get('open_rate', 0):.1%}
- Click rate: {analytics.get('click_rate', 0):.1%}
- Attributed orders: {analytics.get('attributed_orders')}
- Attributed revenue: ₹{analytics.get('attributed_revenue', 0):,.0f}

Write a 3-5 sentence performance summary for the marketer. Be specific about what
the numbers mean, what's working, and one actionable recommendation.
"""


# ---------------------------------------------------------------------------
# NL to segment rules prompt
# ---------------------------------------------------------------------------

def nl_to_rules_prompt(query: str) -> str:
    return f"""Convert this natural language query into a segment rules JSON object.

Query: "{query}"

The rules must use this exact format:
{{
  "operator": "AND" | "OR",
  "conditions": [
    {{"field": "...", "op": "...", "value": ...}},
    ...
  ]
}}

Supported fields: total_spent, order_count, days_since_last_purchase, 
                  days_since_first_purchase, tags, attributes.city, 
                  attributes.gender, attributes.tier, attributes.acquisition_channel

Supported ops: eq, neq, gt, gte, lt, lte, in, contains, between

Rules can be nested: a condition can itself be {{"operator": "OR", "conditions": [...]}}.

Return ONLY the JSON object — no explanation, no markdown code block.
"""
