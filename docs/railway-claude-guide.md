# Using Railway with Claude — The Complete Guide

This guide explains how to manage your apps, databases, and infrastructure on **Railway** by simply talking to **Claude**. You don't need to be a developer. Once set up, you can say things like *"deploy my app"*, *"add a Postgres database"*, or *"why is my service crashing?"* and Claude will do the work for you using the Railway CLI.

---

## Table of Contents

1. [What is Railway?](#1-what-is-railway)
2. [How Railway is organized (Workspaces, Projects, Services)](#2-how-railway-is-organized)
3. [Workspaces in detail](#3-workspaces-in-detail)
4. [One-time setup](#4-one-time-setup)
5. [Letting Claude control Railway](#5-letting-claude-control-railway)
6. [Setting up databases](#6-setting-up-databases)
7. [Everyday tasks — what to say to Claude](#7-everyday-tasks--what-to-say-to-claude)
8. [Environment variables & secrets](#8-environment-variables--secrets)
9. [Domains](#9-domains)
10. [Checking on your app: logs, metrics, status](#10-checking-on-your-app-logs-metrics-status)
11. [Safety rules](#11-safety-rules)
12. [Troubleshooting](#12-troubleshooting)
13. [Cheat sheet](#13-cheat-sheet)

---

## 1. What is Railway?

[Railway](https://railway.com) is a cloud hosting platform. It runs your:

- **Backend apps** (Node.js, Python, Go, anything with a Dockerfile — Railway auto-detects most apps)
- **Databases** (PostgreSQL, MySQL, MongoDB, Redis)
- **Background workers and cron jobs**
- **File/object storage** (S3-compatible buckets)

You pay for what you use. Everything is managed through either the **dashboard** (the website at railway.com) or the **CLI** (a command-line tool). Claude uses the CLI and Railway's MCP tools on your behalf — that's what lets you control everything through plain English.

---

## 2. How Railway is organized

Railway has a simple hierarchy. Understanding it makes everything else click:

```
Workspace  (your account / team — billing happens here)
 └── Project  (one app or product, e.g. "my-saas")
      └── Environment  (production, staging, dev — isolated copies of config)
           └── Service  (one running thing: your API, your database, a worker)
                └── Deployment  (one specific release of that service)
```

| Level | What it is | Real-world analogy |
|---|---|---|
| **Workspace** | Your account or team. Owns billing and members. | The company |
| **Project** | A group of services that belong together. | One product |
| **Environment** | An isolated config plane inside a project. Each has its own variables and deploy history. | "Live" vs "test" copies |
| **Service** | A single deployable unit — an app, a database, a worker. | One machine doing one job |
| **Deployment** | A point-in-time release of a service, with its own build & runtime logs. | One version that went live |

Other resources you may encounter:

- **Volume** — persistent disk storage attached to a service (for databases or file storage).
- **Bucket** — S3-compatible object storage for files, images, uploads.

---

## 3. Workspaces in detail

A **workspace** is the top-level container for everything. Key facts:

### Billing lives at the workspace level
- Each workspace has its own plan (Free/Trial, Hobby, Pro) and its own invoice.
- All projects inside a workspace bill to that workspace's payment method.
- Usage (CPU, memory, network, storage) is metered per service and rolled up to the workspace bill.

### Personal vs. team workspaces
- When you sign up, you get a **personal workspace** (named after you).
- You can create or be invited to **team workspaces**, which allow multiple members.
- A project lives in exactly **one** workspace. If a developer built your project in *their* workspace, you're a guest there — billing and ultimate control belong to the workspace owner. If you want to own it (and pay for it), the project should live in **your** workspace, or be transferred to it.

### Members and roles
In a team workspace, you can invite people by email from the dashboard (**Settings → Members**). Roles:
- **Admin** — full control: billing, members, deleting projects.
- **Member** — can work on projects (deploy, configure) but not manage billing.
- **Deployer** — limited; can deploy/view but not change critical settings.

### Switching workspaces
- **Dashboard:** the workspace switcher is in the top-left corner of railway.com.
- **CLI / Claude:** if you belong to multiple workspaces, Claude can list them and pick the right one. You can ask: *"Which Railway workspace am I in? List my workspaces."*

### Practical workspace advice
- Keep one workspace per "who pays the bill."
- If a contractor sets things up for you, have them do it **in your workspace** (invite them as a Member), so you keep ownership when the engagement ends. You can remove their access at any time from Settings → Members.

---

## 4. One-time setup

You need three things installed: the **Railway CLI**, **Claude Code**, and the **Railway plugin/MCP** that connects them. This takes about 10 minutes.

### Step 1 — Install the Railway CLI

Open your terminal (on Mac: the **Terminal** app) and run one of:

```bash
# Recommended — installs the CLI AND auto-configures Claude in one go:
bash <(curl -fsSL https://railway.com/install.sh) --agents -y

# Or, plain install:
brew install railway          # Mac with Homebrew
npm i -g @railway/cli         # Any OS with Node.js installed
```

### Step 2 — Install Claude Code

If you don't have it yet, follow the instructions at [claude.com/claude-code](https://claude.com/claude-code). The short version:

```bash
npm install -g @anthropic-ai/claude-code
```

Then run `claude` in any folder to start it, and sign in with your Claude account.

### Step 3 — Sign in to Railway

You can let Claude handle this (just ask it to), or do it yourself:

```bash
railway login
```

This opens your browser. **Signing in also creates an account if you don't have one** — there is no separate signup step. If you're on a machine without a browser, `railway login --browserless` prints a link and a short code you can open on your phone.

### Step 4 — Connect Railway to Claude

Inside a terminal, run:

```bash
railway setup agent
```

This installs the Railway **MCP server** and **skills** into Claude Code, so Claude gains Railway-specific tools (listing projects, deploying, reading logs, managing variables, etc.). Alternatively:

```bash
railway mcp install --agent claude-code
```

### Step 5 — Verify it works

Start Claude (`claude`) and ask:

> "Am I signed in to Railway? List my workspaces and projects."

If Claude lists your account and projects, you're done with setup — you should never need to touch the terminal again unless something breaks.

---

## 5. Letting Claude control Railway

Once connected, Claude can do almost everything on Railway for you. **You talk; Claude runs the commands.** Some examples of what Claude can do:

| You say | Claude does |
|---|---|
| "Deploy this app to Railway" | Runs `railway up` — creates a project/service if needed and deploys the current folder |
| "Add a Postgres database" | Provisions a managed Postgres service in your project |
| "Set the STRIPE_KEY variable on my API" | Sets the environment variable on the right service |
| "Why did my last deploy fail?" | Pulls build/deploy logs, reads them, explains the error, often fixes it |
| "Give my app a public URL" | Generates a `*.up.railway.app` domain |
| "Show me memory usage for the last hour" | Pulls service metrics and summarizes |
| "Create a staging environment" | Creates a new isolated environment in the project |
| "Roll back to the previous version" | Redeploys the last successful deployment |

### How it works under the hood (for the curious)
Claude uses three paths, automatically choosing the right one:

1. **Railway MCP tools** — direct API access for things like listing projects, reading logs, deploying, setting variables.
2. **Railway CLI** (`railway ...` commands) — for anything tied to the code on your computer, like deploying the folder you're in.
3. **Railway's own AI agent** (`railway agent`) — for open-ended investigations like "figure out why my service keeps crashing."

You don't need to choose — just describe what you want in plain English.

### Working in the right folder
Claude deploys **the folder you started it in**. So:

1. Open a terminal.
2. `cd` into your project's code folder (or open the folder in Claude Code's desktop/VS Code version).
3. Start `claude`.
4. Ask for what you want.

A folder can be **linked** to a specific Railway project/environment/service so Claude always targets the right thing. Ask Claude: *"Link this folder to my project X, environment production."*

### Good prompting habits
- **Name the environment** when it matters: *"deploy to **staging**"* vs *"deploy to **production**"*.
- **Name the service** when you have several: *"restart the **api** service"*.
- Ask Claude to **verify after acting**: *"deploy and confirm it's healthy"* — Claude will wait for the deploy to succeed and check logs, instead of just kicking it off.
- When in doubt, ask Claude to **explain before doing**: *"What would it take to add Redis? Don't do it yet, just explain."*

---

## 6. Setting up databases

Railway offers fully managed databases. You don't install or maintain anything — Railway runs them as services in your project, with storage on a volume and automatic connection variables.

### Available databases
- **PostgreSQL** — the default choice for most apps (relational data).
- **MySQL** — alternative relational database.
- **MongoDB** — document database.
- **Redis** — in-memory cache / queue.

### Creating a database with Claude
Just ask:

> "Add a Postgres database to my project."

Behind the scenes Claude runs the equivalent of:

```bash
railway add --database postgres
```

Within a minute or two you'll have a running database with credentials already generated.

### Connecting your app to the database
This is the most important concept: **Railway injects connection details as environment variables.** A new Postgres, for example, exposes a `DATABASE_URL` variable on the database service.

To let your app use it, Railway uses **reference variables** — your app's variable *points at* the database's variable, so if credentials ever change, your app updates automatically:

> "Connect my API service to the Postgres database — set DATABASE_URL on the API as a reference to the database's DATABASE_URL."

Claude will set something like `DATABASE_URL = ${{Postgres.DATABASE_URL}}` on your app service. Your app reads `DATABASE_URL` from its environment like any other variable.

### Private vs. public networking
- Services inside the same project/environment talk over Railway's **private network** (free, fast, secure). The private connection URL usually contains `railway.internal`.
- A **public** connection URL (for connecting from your laptop or an external tool) goes over the internet and incurs egress costs. Use it only when needed.
- Rule of thumb: **app → database connections should always use the private URL.** Claude knows this and will default to private.

### Looking inside your database
You can ask Claude things like:

> "Connect to my Postgres and show me the tables."
> "How many rows are in the users table?"
> "Analyze my database performance."

Claude can run read-only queries and analysis for you. For **risky operations** (dropping tables, changing database config), a well-behaved Claude will show you the command and ask you to confirm or run it yourself — that's intentional and protects your data.

### Backups
Railway supports backups on database volumes (the dashboard shows backup options on the database service → Volume tab; scheduled backups availability depends on your plan). Before any big change, it's reasonable to ask:

> "Take a backup of the Postgres database before we change anything."

### One database per environment
Remember: environments are isolated. A Postgres in `production` is a **different database** from a Postgres in `staging`. This is a feature — your testing never touches live customer data. When you create a new environment, you typically also provision its own database.

---

## 7. Everyday tasks — what to say to Claude

A phrasebook for common situations:

**Deploying**
- *"Deploy the current folder to Railway."*
- *"Deploy to the staging environment and tell me when it's live."*
- *"Redeploy the api service."* (re-runs the latest code)
- *"Roll back the api service to the previous deployment."*

**Creating things**
- *"Create a new Railway project called acme-app with a Node service and a Postgres database."*
- *"Add a Redis instance to this project."*
- *"Create a staging environment that mirrors production."*
- *"Add an S3 bucket for file uploads and wire the credentials into my app."*

**Investigating**
- *"Is my app up? Check the latest deployment status."*
- *"Show me the last 200 lines of logs from the api service."*
- *"The site is down — figure out why and fix it."*
- *"How much is this project costing me? What's using the most resources?"*

**Configuring**
- *"List all environment variables on the api service."*
- *"Set SENDGRID_API_KEY=... on the api service in production."*
- *"Add a custom domain app.mycompany.com to the frontend service."*
- *"Scale the api service to 2 replicas."* / *"Increase memory limits."*

**Account & access**
- *"Which workspace and account am I signed into?"*
- *"List all my projects across workspaces."*

---

## 8. Environment variables & secrets

Environment variables are how your app gets its configuration and secrets (API keys, database URLs).

Key rules:

1. **Variables are per service, per environment.** Setting a key on `api` in `staging` does not affect `api` in `production`.
2. **Changing a variable triggers a redeploy** of that service (Railway needs to restart the app for it to pick up the new value). Claude will tell you when this happens.
3. **Reference variables** (`${{ServiceName.VAR}}`) keep services wired together automatically — prefer them for database URLs and internal service URLs.
4. **Never paste secrets into shared docs or chat logs you don't control.** Telling Claude a secret in your own private session so it can set the variable is fine; the value is stored encrypted on Railway.
5. To see what's set: *"List the variables on the api service"* — Claude will show names and values.

---

## 9. Domains

Every web service can have:

- A **Railway-generated domain** — free, instant, looks like `your-app.up.railway.app`. Ask: *"Generate a domain for my service."*
- A **custom domain** — your own, like `app.yourcompany.com`. Ask: *"Add app.mycompany.com to the frontend service."* Claude will set it up and tell you exactly which **CNAME record** to add at your DNS provider (GoDaddy, Namecheap, Cloudflare, etc.). After you add the record, the domain verifies automatically and HTTPS is handled for you.

If your app listens on a specific port, Claude will make sure the domain points at the right port.

---

## 10. Checking on your app: logs, metrics, status

Three layers of visibility, all available through Claude:

1. **Deployment status** — every deploy goes through `QUEUED → BUILDING → DEPLOYING → SUCCESS` (or `FAILED`/`CRASHED`). Ask: *"What's the status of the latest deployment?"*
2. **Logs** — two kinds:
   - **Build logs** — what happened while building your app. Read these when a deploy *fails*.
   - **Runtime logs** — what your app prints while running. Read these when the app is *live but misbehaving*.
   Ask: *"Show me the build logs for the failed deploy"* or *"Tail the runtime logs."*
3. **Metrics** — CPU, memory, network, request counts, error rates, response times. Ask: *"Show me metrics for the api service over the last 24 hours."*

A useful habit after any deploy: ask Claude to **confirm success**, not just start the deploy. A deploy that *started* is not a deploy that *worked* — Claude should watch until the status is `SUCCESS` and the logs look healthy.

---

## 11. Safety rules

Things to keep in mind so you never break production by accident:

1. **Know which environment you're pointed at.** Before any deploy, it's fair to ask Claude: *"Which project and environment is this folder linked to?"* Make changes in dev/staging first when possible.
2. **Destructive actions deserve a pause.** Deleting a service, removing a volume, or dropping a database table is permanent. Claude should confirm with you before doing these — and you should read that confirmation carefully before saying yes.
3. **Databases are precious.** Back up before schema changes. Never delete a database service casually — the volume holds your data.
4. **Secrets stay in Railway variables**, not in code, not in files you email around.
5. **Billing awareness.** Every running service costs money around the clock. If Claude creates experiments, ask it to clean them up: *"Delete the test project we made earlier."* Check your usage anytime at the dashboard → workspace → Usage, or ask Claude.
6. **One change at a time on production.** If something breaks, you'll know exactly what caused it.

---

## 12. Troubleshooting

| Symptom | What to do |
|---|---|
| Claude says it's not authenticated / `NOT_AUTHENTICATED` | Ask Claude to sign you in — it runs `railway login`, which opens your browser. Complete the sign-in there. |
| Sign-in prints a link and a code instead of opening a browser | That's the device-code flow. Open the link on any device, enter the code **within 10 minutes**. |
| "Command not recognized" or weird CLI errors | The CLI may be outdated. Ask Claude to run `railway upgrade`. |
| Deploy failed | Ask: *"Read the build logs for the failed deployment and fix the problem."* This is Claude's bread and butter. |
| App deployed but the URL shows an error | Ask Claude to read the **runtime** logs and check the service's port/domain configuration. |
| Claude is operating on the wrong project | Say: *"Unlink this folder and link it to project X, environment Y, service Z."* Or paste the project's dashboard URL — it contains the exact IDs. |
| You see a project in the dashboard but Claude can't | You may be in a different **workspace**. Ask Claude to list workspaces and switch context. |
| Variable change didn't take effect | Variables apply on the next deploy. Ask Claude to redeploy the service. |

**Pro tip:** you can always paste a Railway **dashboard URL** (from your browser's address bar) into Claude. The URL contains the project/service/environment IDs, so Claude knows exactly what you're talking about — this removes all ambiguity.

---

## 13. Cheat sheet

The commands Claude runs for you, in case you ever want to run them yourself:

```bash
# Identity & context
railway whoami                # who am I, which workspace
railway status                # which project/env/service this folder is linked to
railway list                  # list projects
railway link                  # link this folder to a project

# Creating
railway init --name my-app            # new project
railway add --service api             # new empty service
railway add --database postgres       # new Postgres (also: mysql, mongo, redis)

# Deploying
railway up                    # deploy current folder (signs you in / creates project if needed)
railway up --detach           # deploy without streaming logs
railway redeploy              # redeploy latest
railway down                  # remove latest deployment

# Observing
railway logs --lines 200      # recent logs
railway deployment list       # deployment history & statuses
railway metrics --since 1h    # resource usage

# Configuring
railway variable list                      # list env vars
railway variable set KEY=value             # set an env var
railway domain                             # generate a railway.app domain
railway environment <name>                 # switch environment

# Maintenance
railway upgrade               # update the CLI
railway open                  # open the project dashboard in browser
railway login / railway logout
```

---

## Final word

The mental model is simple:

> **Workspace** = who pays → **Project** = your product → **Environment** = prod vs. test → **Service** = each running piece → and **Claude is your operator.**

Describe what you want in plain English, let Claude run the commands, and always have it verify the result. For anything destructive, slow down and read before confirming. Everything else — deploys, databases, domains, logs, scaling — you can now do with a sentence.
