# Privacy Policy for Hit-It Bridge

**Effective Date:** March 28, 2026

Hit-It Bridge ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and share information when you use the Hit-It Bridge browser extension (the "Extension").

## 1. Information We Collect

The Extension facilitates communication between the Hit-It web application (`hit-it.co.in`) and your local application interfaces (`localhost`). To perform its core functionalities, the Extension collects and processes the following information:

*   **Authentication Tokens:** The Extension reads the `auth_token` stored in your browser's local storage for `hit-it.co.in`. This token is required to securely connect to the Hit-It Bridge WebSocket server and authenticate your identity.
*   **Request Data:** When you initiate requests from the Hit-It platform, the Extension receives and processes network request details (URLs, Methods, Headers, and Request Bodies). 
*   **Response Data:** The Extension reads the responses (Status Codes, Headers, and Bodies) from the local APIs you communicate with.

## 2. How We Use and Share Information

We prioritize data minimization and security. The information collected is used exclusively for the following purposes:

*   **Establishing the Local Bridge:** The authentication token is sent directly to the Hit-It Bridge server via a secure WebSocket connection to verify your account. It is not shared with any third-party services.
*   **Routing Requests:** Network requests directed by you on the Hit-It platform are passed directly from the Hit-It websocket backend to your local machine.
*   **Returning Responses:** The payload of any response your local API produces is forwarded directly back to the Hit-It backend over the authenticated WebSocket. 

**Important Data Handling Practices:**
*   **No Telemetry or Tracking:** We do not track your browsing habits, inject analytics into your pages, or log the requests you execute on our own remote storage. Data solely transits your connection stream.
*   **Target Scoping:** The extension strictly limits requests to `localhost` and `127.0.0.1` targets, preventing any unauthorized remote communication that is not explicitly authorized on your local device.

## 3. Storage and Retention

*   Your JWT `auth_token` and recent request logs (for the popup interface) are temporarily stored locally in your browser leveraging the Chrome specific local storage. 
*   These stored logs remain on your device entirely and are completely wiped when you either manually clear the logs, disconnect, or if your session expires.

## 4. Required Permissions

To deliver this service, the Extension requires:
*   **`storage`:** Used locally on your device to cache your active Token and keep a temporary log of the 50 most recent network hits.
*   **`tabs` / `host_permissions`:** Allows the extension to read the access token from the `hit-it.co.in` tab and communicate explicitly with your designated network environments.

## 5. Contact Us

If you have any questions or concerns regarding this Privacy Policy or how Hit-It Bridge handles your data, please contact the developer at:
support@hit-it.co.in
