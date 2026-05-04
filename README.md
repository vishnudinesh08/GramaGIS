# GramaGIS

GramaGIS is a full-stack GIS platform for local government administration and citizen engagement. Built for grama panchayat workflows, it combines interactive spatial mapping, AI-assisted place discovery, civic feedback management, and secure administrative data operations in a single web application.

## Overview

GramaGIS helps citizens explore public assets and services through an interactive map, while enabling administrators to manage geospatial records and respond to field feedback through a protected dashboard. The platform is designed around a GeoServer and PostgreSQL/PostGIS stack, with a lightweight web frontend and an Express-based backend.

## Key Features

- Interactive web map for wards, infrastructure, and public service layers
- Natural-language search powered by Gemini for location-aware GIS queries
- Public feedback submission and tracking workflow
- Secure admin portal for data editing, review, and GIS record management
- GeoServer proxy layer for controlled WMS, WFS, and WFS-T operations
- JWT-based authentication with role-based access for administrative users

## System Architecture

GramaGIS follows a three-layer architecture:

- Frontend: Static HTML, CSS, and JavaScript interfaces for citizens and administrators
- Backend: Node.js and Express services for authentication, feedback, query handling, and GeoServer proxy operations
- Data and GIS Services: PostgreSQL/PostGIS for application data and GeoServer for spatial publishing and editing

## Technology Stack

- Frontend: HTML, CSS, JavaScript, Leaflet
- Backend: Node.js, Express
- Database: PostgreSQL, PostGIS
- GIS Server: GeoServer
- Authentication: JWT
- AI Integration: Google Gemini API

## Project Structure

```text
GramaGIS/
|-- FE/           Frontend pages, styles, and client-side scripts
|-- BE/           Backend server, routes, middleware, scripts, and SQL
|-- docs/         Architecture 
|-- report_src/   Report source, figures, and project screenshots
|-- README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL with PostGIS enabled
- GeoServer with the project workspace and published layers
- Gemini API key for natural-language query support

### Run Locally

1. Install backend dependencies:

```bash
cd BE
npm install
```

2. Create a `BE/.env` file and configure the required values for:

- `PORT`
- `JWT_SECRET`
- PostgreSQL connection settings
- GeoServer connection settings
- `GEMINI_API_KEY`

3. Start the application:

```bash
cd BE
npm run dev
```

4. Open the app in the browser:

- Public portal: `http://localhost:3000/`
- Admin login: `http://localhost:3000/FE/html/login.html`
- Interactive map: `http://localhost:3000/FE/html/map.html`

## Core API Modules

- `/api/auth` - authentication and session endpoints
- `/api/feedback` - citizen feedback submission and review
- `/api/nlquery` - AI-assisted natural-language GIS queries
- `/api/proxy` - GeoServer proxy endpoints for map and data operations
- `/api/health` - application health check

## Documentation

Project diagrams and supporting materials are available in the `docs/` and `report_src/` directories.

## Authors

Developed by Akshay, Malavika, Sajin, and Vishnu.
