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
## Access model

This repository is public for project review and instructor access. The application itself does not provide open self-registration.

User accounts are created through the invitation flow, and access to the application requires authentication. Environment secrets, database credentials, and user data are not included in this repository.