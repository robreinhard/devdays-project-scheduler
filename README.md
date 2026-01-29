# Dev Days Project Scheduler

> **ALPHA** - This project is in early development and may have breaking changes.

A JIRA-powered GANTT chart visualization tool for estimating and scheduling work using "Dev Days" as the unit of effort.

**Vibecoded** with [Claude Code](https://claude.ai/code) | Architecture by Rob Reinhard

## What is a "Dev Day"?

A **Dev Day** is a unit of effort representing one developer working for one day. Unlike story points, Dev Days translate directly to calendar time, making project timelines easier to communicate and plan.

- 1 Dev Day = 1 developer × 1 day of work
- Dev Days account for team capacity and parallel work

## Features

- Interactive GANTT chart visualization of JIRA issues
- Automatic scheduling based on Dev Day estimates and team capacity
- Sprint-aware timeline calculations
- Epic grouping and filtering
- Dependency visualization between issues
- Configurable developer capacity per sprint
- Drag-and-drop timeline ordering

## Tech Stack

- **Framework**: Next.js 16
- **UI**: Material UI (MUI) 7
- **Language**: TypeScript
- **Date Handling**: Luxon, Day.js
- **Data Source**: JIRA Cloud REST API

## Environment Variables

Create a `.env.local` file based on `.env.local.example`:

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_BASE_URL` | Yes | Your JIRA instance URL (e.g., `https://yourcompany.atlassian.net`) |
| `JIRA_EMAIL` | Yes | Email for JIRA API authentication |
| `JIRA_API_TOKEN` | Yes | API token from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `JIRA_FIELD_DEV_DAYS` | Yes | Custom field ID for Dev Days estimates |
| `JIRA_FIELD_TIMELINE_ORDER` | Yes | Custom field ID for timeline ordering |
| `JIRA_BOARD_ID` | Yes | Board ID for fetching sprints |
| `NEXT_PUBLIC_JIRA_BASE_URL` | No | Public JIRA URL for issue links (defaults to `JIRA_BASE_URL`) |
| `NEXT_PUBLIC_TIMEZONE` | No | IANA timezone identifier (default: `America/Chicago`) |

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/devdays-project-scheduler.git
   cd devdays-project-scheduler
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your JIRA credentials and field IDs
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
