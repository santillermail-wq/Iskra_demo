<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1jlOll-88ZH8losxDCE4ikJh031Ild9Hq

## Run Locally

**Prerequisites:**  Node.js

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Set up your environment variables:**
    -   Create a file named `.env.local` in the root of your project.
    -   Add your Gemini API key to this file. The variable **must** be named `API_KEY`.
        ```
        API_KEY=YOUR_API_KEY_HERE
        ```
3.  **Run the app:**
    ```bash
    npm run dev
    ```

When deploying to a service like Vercel, you must set `API_KEY` as an environment variable in your project settings.