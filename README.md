# ☕ BrewBharat CRM

BrewBharat CRM is a production-grade, full-stack customer relationship and marketing platform built specifically for an Indian D2C coffee brand. It features a rich dashboard, dynamic audience segmentation, multi-channel campaign delivery, real-time analytics, and deep AI integrations.

---

## ✨ Core Features

### 👥 Customer Management
* **Database & Profiles**: Manage customers with detailed profiles (City, Tier, Acquisition Channel, Tags).
* **Order History**: View recent orders and track lifetime value (Total Spent).
* **Bulk Import**: Effortlessly import customers via CSV or JSON format with built-in duplicate skipping.
* **Filtering & Search**: Quickly find customers using search or quick-filters (by City or Tier).

### 🎯 Dynamic Segmentation
* **Visual Rule Builder**: Create complex audience segments using nested `AND/OR` logic across multiple fields (e.g., `total_spent >= 5000` AND `attributes.city == "Mumbai"`).
* **Live Preview**: See the exact number of matching customers and a sample list update in real-time as you build rules.
* **Natural Language (AI)**: Describe your audience in plain English (e.g., "High spenders from Delhi who haven't ordered in 30 days"), and the AI instantly generates the exact rules.

### 📣 Multi-Channel Campaigns
* **Omnichannel Delivery**: Launch campaigns across WhatsApp, SMS, Email, and RCS.
* **Personalization**: Use merge tags (e.g., `{name}`, `{city}`, `{tier}`) to dynamically personalize messages for each recipient.
* **Live Message Preview**: Preview the exact personalized message a real sample customer will receive before hitting launch.
* **AI Message Drafting**: Give the AI a goal (e.g., "Win back lapsed customers"), and it writes a high-converting, personalized message for your chosen channel.

### 📊 Real-Time Analytics & Attribution
* **Delivery Funnel**: Track campaign performance through every stage: Queued → Sent → Delivered → Opened → Clicked.
* **Revenue Attribution**: Tracks orders placed within 72 hours of a customer engaging with a campaign to measure direct ROI.
* **AI Campaign Insights**: The AI analyzes the delivery funnel and attribution data to generate a human-readable performance summary and actionable recommendations (powered by DeepSeek R1).

### 🤖 AI Co-pilot
* **Conversational Agent**: A persistent AI assistant docked in the corner that can read and write to the CRM.
* **Agentic Capabilities**: Ask it to "Show me the top performing campaigns" or "Create a segment of VIP customers from Bangalore," and it calls the necessary APIs, executes the action, and streams the results back to you.

---

## 🛠️ Tech Stack & Architecture

BrewBharat CRM is built using a modern, decoupled architecture spread across three main services:

### 1. Frontend Web App (`/frontend`)
* **Framework**: Next.js 15 (App Router), React, TypeScript.
* **Styling**: Custom "Dark Roast" design system built with Tailwind CSS.
* **State & Data Fetching**: TanStack React Query (for server state) and Zustand (for client state/auth).
* **Charts**: Recharts for revenue and campaign trend visualization.
* **Deployment**: Hosted on Render.

### 2. Backend API (`/backend/crm-backend`)
* **Framework**: FastAPI (Python) for high-performance, asynchronous endpoints.
* **Database**: PostgreSQL (hosted on Supabase) with async SQLAlchemy ORM and Alembic for migrations.
* **Caching & Queues**: Redis (hosted on Upstash) for rate limiting and background task queues.
* **AI Routing**: OpenRouter API.
  * *DeepSeek-Chat-V3* (Fast) for draft generation and NL-to-Segment.
  * *DeepSeek-R1* (Smart) for heavy reasoning, AI Co-pilot agent loops, and Campaign Insights.
* **Deployment**: Hosted on Render as a standalone ASGI web service.

### 3. Channel Service (`/channel-service` or integrated webhook handlers)
* **Purpose**: Simulates integration with third-party telecom/email providers (e.g., Twilio, Gupshup, SendGrid).
* **Webhooks**: Handles HMAC-secured delivery receipts and read/click events to update the campaign delivery funnel in real-time.

---

## 🚀 Running Locally

### Prerequisites
* Node.js (v18+)
* Python (3.10+)
* A Supabase PostgreSQL database
* An Upstash Redis instance
* An OpenRouter API Key

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend/crm-backend
   ```
2. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Set up your `.env` file (copy from `.env.example` and fill in DB/Redis/OpenRouter keys).
4. Run database migrations:
   ```bash
   alembic upgrade head
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your `.env.local` file:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔒 Security & Best Practices
* **JWT Authentication**: All API endpoints (except webhooks) are secured via Bearer tokens.
* **Password Hashing**: Admin passwords are securely hashed using bcrypt.
* **HMAC Signatures**: Webhook payloads between the channel service and backend are cryptographically signed to prevent spoofing.
* **Idempotency**: Bulk imports and certain mutating endpoints are designed to be safely retriable.
* **Input Validation**: Strict schema validation using Pydantic (backend) prevents SQL injection and enforces data integrity (e.g., validating Segment rule operators against allowed lists).
