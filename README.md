# LeetCode Activity Tracker Chrome Extension

A Chrome extension that helps you track your LeetCode activity, including time spent solving problems, daily sessions, and progress over time.

## Features

- **Time Tracking**
  - Track total time spent on LeetCode per day
  - Monitor individual coding sessions
  - Automatic idle detection
  - Session-based tracking

- **Problem Tracking**
  - Track problems attempted and solved
  - Record problem difficulty levels
  - Track time spent per problem
  - Store submission history

- **Activity History**
  - View daily statistics
  - Historical data visualization
  - Session breakdowns
  - Problem-solving patterns

- **User Authentication**
  - Secure Google OAuth login
  - Cloud data synchronization
  - Cross-device access to statistics

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/leetcode-activity-tracker.git
   ```

2. Set up MongoDB:
   - Create a MongoDB Atlas account or use your existing one
   - Create a new cluster and database
   - Note down your connection string

3. Set up Google OAuth:
   - Go to the Google Cloud Console
   - Create a new project
   - Enable the OAuth 2.0 API
   - Create credentials (OAuth client ID)
   - Add your extension ID to the authorized JavaScript origins

4. Configure the extension:
   - Open `manifest.json`
   - Replace `${YOUR_OAUTH_CLIENT_ID}` with your Google OAuth client ID
   - Update the MongoDB connection URL in your backend configuration

5. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension directory

## Usage

1. Click the extension icon in Chrome
2. Log in with your Google account
3. Start solving problems on LeetCode
4. The extension will automatically track your activity
5. View your statistics in the extension popup
6. Access historical data through the history view

## Development

### Prerequisites

- Node.js and npm
- MongoDB
- Chrome browser

### Project Structure

```
leetcode-activity-tracker/
├── src/
│   ├── js/
│   │   ├── background.js
│   │   ├── content.js
│   │   └── popup.js
│   ├── css/
│   │   └── styles.css
│   └── html/
│       └── popup.html
├── manifest.json
└── README.md
```

### Building

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Privacy

This extension:
- Only tracks your activity on LeetCode.com
- Stores data securely in MongoDB
- Requires explicit user authentication
- Does not track personal information beyond LeetCode activity

## License

MIT License - see LICENSE file for details

## Support

For issues, feature requests, or questions:
1. Open an issue in the GitHub repository
2. Email support at: support@leetcodetracker.com

## Acknowledgments

- LeetCode for their platform
- Chrome Extensions documentation
- MongoDB Atlas
- Google OAuth 