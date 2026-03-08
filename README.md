# GramaGIS: Intelligent Rural Infrastructure Management

GramaGIS is a web-based, AI-powered GIS portal designed to modernize rural infrastructure management. It bridges the gap between complex geospatial data and everyday administrative needs for Grama Panchayats.

## Core Tech Stack
* **Frontend:** Leaflet.js (Interactive Mapping), HTML5, CSS3, JavaScript
* **Backend:** Node.js, Express.js (Secure Proxy & NLP Coordinator)
* **Spatial Engine:** GeoServer (WMS/WFS/WFS-T)
* **Database:** PostgreSQL with PostGIS
* **AI Integration:** Google Gemini API (Natural Language to CQL Translation)

## Key Features
- **Intelligent Querying:** Natural language interface for querying village assets (e.g., "Show me all primary schools in Ward 5").
- **Transactional GIS (T-GIS):** Secure admin module for real-time creation, update, and deletion of village infrastructure.
- **Role-Based Access:** Secure JWT-based authentication for administrative operations.
- **Data Centralization:** Unified repository for ward boundaries, public utilities, and infrastructure points.

## Architecture Overview
GramaGIS utilizes a proxy-based "Island View" architecture. The frontend never communicates directly with the spatial server; instead, it routes all queries through a secure Express.js API that handles authentication, data validation, and AI query translation.



## Getting Started
1. Clone the repository.
2. Set up a PostgreSQL/PostGIS database.
3. Publish your spatial data via GeoServer.
4. Configure the Express.js environment in the `/BE` folder and connect your API keys.
5. Launch the application to start visualizing village infrastructure.

---
*Developed by: Akshay, Malavika, Sajin, and Vishnu*