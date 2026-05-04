# CST458 Assignment

## Part A - Project Details

### 1. Project Identification
- Project title: GramaGIS - A Smart Panchayat GIS Portal
- Team members: Akshay Kumar A S, Malavika Sasi, Sajin Pathrose, Vishnu Dinesh
- Guide name: Dr. Dhanya S Pankaj
- Problem addressed by the project: Fragmented rural administrative and infrastructure data was not available through a single spatial platform for transparent governance and efficient local planning.
- Main technologies used: HTML, CSS, JavaScript, Leaflet, Node.js, Express.js, PostgreSQL, PostGIS, GeoServer, JWT authentication, Google Gemini API
- Modules / major features developed: public landing page, interactive GIS map, ward and asset layer visualization, natural-language GIS search, citizen feedback submission and tracking, admin login, admin GIS data management, feedback review dashboard, GeoServer WMS/WFS/WFS-T proxy

## Part B - Testing Practices Actually Followed

### 2. Testing Planning
- No formal testing plan is present in the project repository.
- No documented test case sheet or dedicated test document is present in the repository.
- Requirements were reviewed informally using the project objectives, module list, workflow diagrams, and expected user flows.
- Expected outputs were identified in advance for major flows such as login success/failure, feedback submission, map layer loading, search results, and admin record updates.
- No separate large test dataset was prepared; testing mainly depended on available GeoServer/PostGIS data, seeded auth users, and manually created feedback entries.

### 3. Unit Testing
- Individual modules were checked separately, especially `/api/auth`, `/api/feedback`, `/api/nlquery`, and `/api/proxy`.
- Frontend units were also checked individually, including login validation, map layer toggling, search query handling, feedback form validation, and admin edit actions.
- Unit checking was mainly performed by the development team during local execution and debugging.
- White box ideas were used informally by checking validation branches, auth guards, role checks, status normalization, and XML generation logic.
- No formal unit test cases were documented for individual functions or classes.
- No unit testing framework such as Jest, Mocha, or Vitest is configured in the repository.
- Defects noticed during module-level checking included missing field validation issues, coordinate-pair validation problems, session expiry handling, schema mismatch cases, and some UI text/rendering issues.

### 4. Integration Testing
- The first major integration tested was frontend pages with the Express backend.
- Authentication flow was checked end-to-end between the login page, auth route, JWT token storage, and protected admin pages.
- Feedback flow was checked between the public form, backend validation, and PostgreSQL/PostGIS storage.
- Query flow was checked between the search UI, backend Gemini call, GeoServer WFS queries, and final map/result display.
- Admin editing flow was checked between the dashboard, schema fetch, WFS layer fetch, GeoServer WFS-T proxy, and stored spatial data.
- Module interactions were tested mainly through live browser execution and manual API flow checking.
- Problems identified during integration included backend URL/CORS issues, GeoServer timeout or invalid response cases, layer schema mismatches, token propagation errors, and data mapping inconsistencies across frontend and backend.

### 5. System Testing
- The complete system was tested as a whole by running the full stack locally.
- System-level features checked included map loading, layer toggling, feature info display, natural-language search, public feedback submission, admin login, feedback review, and GIS feature editing.
- End-to-end workflow checking was done for citizen-side usage and admin-side usage.
- Database, UI, backend, and output consistency were checked together for feedback status updates, map search results, protected admin actions, and data downloads.
- Major issues found during system testing included failures when GeoServer or Gemini was unavailable, mismatched layer field names, empty-result handling problems, and session/auth related interruptions.

### 6. Acceptance Testing
- The project was mainly validated through guide and faculty review during project discussions, demos, and internal evaluations.
- Feedback focused on feature completeness, usability of the map interface, correctness of displayed data, and usefulness of the portal for panchayat administration.
- Suggested corrections such as improving UI clarity, refining search/help behavior, and making admin workflows clearer were incorporated into the project.
- The main project objective of providing a smart Panchayat GIS portal was achieved.
- Formal acceptance testing with real Panchayat officials or a broad end-user group was limited.

### 7. Functional Testing
- Major functions were tested against requirements in a manual way.
- Important functions checked included login, token-protected access, map layer visibility, feature info lookup, natural-language search, feedback submission, feedback status update, GIS record create/update/delete, and export/download.
- Valid inputs and invalid inputs were tried for credentials, feedback forms, category names, ward values, coordinates, layer names, and feature edit actions.
- Missing functional tests include more edge cases for malformed AI output, concurrent admin edits, unsupported geometry cases, and failures from external services.
- Functional defects observed included invalid input handling issues, search parsing failures for some queries, GeoServer schema drift problems, and occasional UI rendering/encoding inconsistencies.

### 8. Performance / Stress Testing
- Response time was checked informally while using the running application.
- Login flow, WMS/WFS map loading, natural-language search response, feedback submission, and admin save/update actions were observed for delays.
- The codebase includes timeout handling for backend-to-service requests, which shows that slow external responses were considered during testing.
- No formal load testing or stress testing tool is present in the project.
- No multiple-user simulation or high-concurrency testing was carried out in a structured way.
- No CPU, memory, or browser performance profiling report is present in the repository.
- Limitations in performance testing include dependence on local network speed, GeoServer responsiveness, AI service latency, and the absence of automated load scenarios.

### 9. Usability Testing
- Ease of use of the interface was checked manually for the landing page, map page, feedback page, login page, and admin dashboard.
- Navigation flow and clarity of available actions were checked through the citizen and admin workflows.
- Search help text, status badges, alerts, and button labeling indicate that usability feedback was considered during development.
- Some UI adjustments appear to have been made to improve clarity in feedback review, map search guidance, and login/admin interaction.
- Usability issues that can still be noticed include dependence on GIS-specific layer names, limited mobile-focused verification, complex admin editing flow, and error messages that could be even more user-friendly.
- No formal usability study with a structured questionnaire is documented.

### 10. Regression Testing
- Previous features were rechecked manually after modifications.
- After changes in auth, feedback, query, or proxy logic, major flows such as login, layer loading, search, and admin actions had to be tested again.
- Repeated manual testing was carried out after updates, but it was not supported by an automated regression suite.
- Bug fixes could still introduce new errors because the project has tight coupling between frontend, backend, GeoServer, Gemini, and database behavior.
- No reusable regression checklist or documented regression test case set is present in the repository.
- The main gap in regression testing is the lack of automation and repeatable coverage.

## Part C - Testing Approaches Used

### 11. Black Box Testing Practices
- Input-output based testing was done for login, feedback submission, search requests, map layer retrieval, and data export.
- Equivalence-style checking was partly followed by trying valid and invalid credentials, valid and invalid categories, valid and invalid wards, supported and unsupported layer names, and valid and invalid status values.
- Boundary-related checking was partly done for longitude and latitude ranges, ward parsing, request limits such as `maxFeatures`, and login attempt limits.
- Invalid input conditions were tested through empty form fields, wrong tokens, unsupported actions, incomplete coordinates, and invalid service states.
- Example black box situations from the project include checking whether wrong credentials return an auth error, whether invalid feedback coordinates are rejected, whether unsupported layers are blocked, and whether a valid natural-language query returns the expected map result.

### 12. White Box Testing Practices
- Code-level logic was checked manually while developing and debugging the backend and frontend modules.
- Conditions, branches, and loops were verified informally in auth rate limiting, category/status normalization, coordinate validation, route protection, layer whitelisting, and result rendering.
- Internal paths were checked for successful and failure branches such as missing env variables, invalid JWT, database-not-configured cases, timeout cases, and non-JSON GeoServer responses.
- Exception handling paths were also checked in backend routes and frontend `fetch` error handling.
- Example white box testing done in the project includes stepping through login validation, checking how feedback status aliases are normalized, verifying WKT-to-GML conversion logic, and checking timeout/error branches in GeoServer and Gemini proxy requests.
- No formal white box coverage tool or code coverage report is present.

### 13. Grey Box Testing Practices
- Testing was done with partial knowledge of internals because the team knew the route structure, database-backed modules, GeoServer layers, and auth roles while still validating the project through the UI.
- Knowledge of database structure, API behavior, and internal workflow helped in tracing errors and checking correctness.
- Testers used both UI behavior and internal implementation details for admin edit flow, feedback persistence, protected routes, and query-to-result mapping.
- Example grey box situations include checking whether a UI search produced the expected backend query behavior, confirming that feedback status changes were stored and reflected correctly, and verifying that the schema-driven admin editor matched the actual published layer fields.

## Part D - Evaluation and Improvements

### 14. Gaps in Your Existing Testing Process
- No formal testing plan was prepared.
- Documented test cases were missing.
- Automated unit testing was missing.
- Automated integration and regression testing were missing.
- Performance and stress testing were weak.
- Acceptance testing with real field users was limited.
- Test coverage for error cases, concurrent edits, and external service failures was incomplete.
- No dedicated test automation or CI pipeline is configured in the project.
- Defect tracking and retesting workflow were not formalized in a separate tool.
- External dependency issues from GeoServer and Gemini increased testing complexity.
- Time constraints and coordination effort across frontend, backend, GIS server, and database likely reduced the depth of testing.

### 15. Suggested Improvements to Improve Project Quality
- Add unit tests for auth validation, feedback validation, status/category normalization, query parsing, and XML builder functions.
- Add integration tests for login flow, feedback flow, GeoServer proxy flow, schema fetch flow, and admin CRUD flow.
- Add a structured system test checklist for all citizen and admin workflows before every demo or release.
- Conduct formal acceptance testing with guide, faculty, and if possible real Panchayat staff or intended users.
- Maintain a regression checklist and rerun it after each major change.
- Prepare documented test cases with valid, invalid, and boundary-value inputs.
- Introduce automation tools such as Jest/Supertest for backend APIs and Playwright or Selenium for core UI flows.
- Perform usability testing with a small set of real users and improve interface wording based on observed confusion points.
- Perform performance testing on large map layers and multiple requests using tools such as k6, Artillery, or browser profiling.
- Use a simple defect tracking process to record bugs, fixes, retest status, and pending issues.

### 16. Final Reflection
- The project did reasonably well in manual functional, integration, and full-system testing of real workflows.
- Testing was insufficient in formal planning, documentation, regression coverage, load testing, and automation.
- Test case design, reusable test data, and acceptance planning should have been done earlier in the project.
- Better testing would improve reliability of external integrations, reduce regression risk, improve usability, and increase confidence during deployment and demonstrations.
