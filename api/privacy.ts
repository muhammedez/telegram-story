export function GET(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Telegram Story Downloader Bot</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      background-color: #f8fafc;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      background: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    h1 {
      font-size: 26px;
      color: #0f172a;
      margin-top: 0;
    }
    h2 {
      font-size: 18px;
      color: #334155;
      margin-top: 24px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
    }
    p, li {
      font-size: 15px;
      color: #475569;
    }
    ul {
      padding-left: 20px;
    }
    .badge {
      display: inline-block;
      background: #e0f2fe;
      color: #0284c7;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    footer {
      margin-top: 32px;
      font-size: 13px;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <span class="badge">100% Anonymous & Secure</span>
    <h1>Privacy Policy</h1>
    <p>Last updated: November 1, 2026</p>

    <h2>1. Overview</h2>
    <p>This Telegram bot is designed with privacy and anonymity as core principles. It allows users to fetch public Telegram stories without tracking, profiling, or revealing their identity.</p>

    <h2>2. Anonymity & Story Viewing</h2>
    <ul>
      <li><strong>Zero View Registration:</strong> The bot accesses public stories via MTProto without registering story views. Story creators will never see your account or identity in their viewer list.</li>
      <li><strong>Story Visibility:</strong> Only stories that the fetching account is allowed to view are processed. Stories limited to contacts or close friends stay inaccessible.</li>
    </ul>

    <h2>3. Data Collection & Storage</h2>
    <ul>
      <li><strong>Ephemeral Media:</strong> Photos and videos are held in temporary memory only during transmission to Telegram and are never stored on persistent disks or databases.</li>
      <li><strong>Rate Limiting:</strong> Your Telegram User ID is temporarily used in an in-memory cache solely to prevent automated spam and abuse (rate-limiting).</li>
      <li><strong>No Account Tracking:</strong> The bot does not track or store the history of usernames or stories you view.</li>
    </ul>

    <h2>4. Third-Party Sharing</h2>
    <p>We do not sell, rent, monetize, or share any user queries, user IDs, or content with third parties or advertisers.</p>

    <h2>5. Contact & Updates</h2>
    <p>This privacy policy may be updated periodically to reflect new features or security practices.</p>

    <footer>
      &copy; 2026 Telegram Story Downloader Bot. All rights reserved.
    </footer>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
