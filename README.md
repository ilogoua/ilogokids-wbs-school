# iLogoKids

iLogoKids is a web-based 2D social connection map developed as a final project for WBS CODING SCHOOL.

Users join through invitations instead of open self-registration. Connections are displayed as an interactive graph with a school-notebook visual style.

## Current status

Implemented so far:

- React + TypeScript frontend
- Node.js + Express backend
- MongoDB with Mongoose
- Recursive interactive 2D graph
- Pan and zoom navigation
- German / English UI
- Separate user and graph-topology models
- Local invitation UI prototype

Authentication, persistent invitations and realtime messaging are still in development.

## Tech stack

React · TypeScript · Vite · Node.js · Express · MongoDB · Mongoose · SVG

## Local development

```sh
npm install
npm --prefix client install
npm --prefix server install
npm run dev
```

Frontend: `http://localhost:5173`
Backend: `http://localhost:3000`
Health check: `http://localhost:3000/api/health`

## Build

```sh
npm run build
```
## First root account (manual CLI only)

Run once against an empty database. The command creates a `direx` User, a
topology-only root GraphNode and a UserGraphLink in one Atlas transaction.
It refuses to run if any users, graph nodes or links already exist, including
on a repeated or concurrent invocation. It does not expose an HTTP endpoint.

Set `MONGO_URL` in the environment or in `server/.env`. Prepare a private JSON
file outside the repository, with permissions `0600`, containing these keys:

```json
{
  "loginName": "direx",
  "publicName": "Direx",
  "email": "your-real-email@example.com",
  "password": "replace-with-a-strong-password"
}
```

From the repository root:

```sh
npm run build
npm --prefix server run bootstrap:root < /private/tmp/ilogokids-root.json
```

Delete the private input file after use. Passwords are read from stdin and are
never printed. Successful output contains only the created user and node IDs.

## Access model

This repository is public for project review and instructor access. The application itself does not provide open self-registration.

User accounts are created through the invitation flow, and access to the application requires authentication. Environment secrets, database credentials, and user data are not included in this repository.
