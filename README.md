# Williams College Makerspace Project Display

A beautiful, automated display system for showcasing Williams College Makerspace student projects. The system automatically scrapes project data from the Williams Makerspace website and displays it in an elegant, cycling format perfect for public displays.

## 🌟 Features

- **Automated Project Scraping**: Daily updates from Williams Makerspace website
- **Responsive 3x3 Grid Layout**: Optimized for 16:9 displays
- **Smart Wraparound**: Always shows exactly 9 projects, cycling seamlessly
- **Tag-Based Filtering**: Only shows projects tagged with "makerspace"
- **QR Code Generation**: Auto-generated QR codes for each project
- **Glass-morphism Design**: Modern, elegant UI with backdrop blur effects
- **Cross-Browser Compatible**: Works on Chrome, Firefox, Safari, and WebKit browsers

## 🚀 Live Demo

Visit the live display: [https://alicesore.github.io/makerspace-project-display/](https://alicesore.github.io/makerspace-project-display/)

## 🛠️ Technical Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript
- **Scraping**: Node.js with Puppeteer and Cheerio
- **Deployment**: GitHub Pages with GitHub Actions
- **Automation**: Daily cron job for data updates

## 📋 Project Structure

```
makerspace-project-display/
├── index.html              # Main display page
├── styles.css              # Styling and layout
├── script.js               # Frontend logic and cycling
├── data/
│   └── projects.json       # Project data (auto-generated)
├── assets/
│   ├── images/             # Static images
│   └── qr-codes/           # Generated QR codes
├── scraper/
│   ├── package.json        # Node.js dependencies
│   └── scraper.js          # Web scraping logic
└── .github/workflows/
    └── deploy.yml          # GitHub Actions automation
```

## 🔧 Setup Instructions

### 1. Clone and Push to GitHub

```bash
# Clone your repository
git clone https://github.com/alicesore/makerspace-project-display.git
cd makerspace-project-display

# Add your files and push
git add .
git commit -m "Initial commit: Makerspace project display system"
git push origin main
```

### 2. Enable GitHub Pages

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Pages**
3. Under **Source**, select **GitHub Actions**
4. The site will be available at `https://yourusername.github.io/makerspace-project-display/`

### 3. Configure Automated Updates

The system automatically:
- ✅ Runs daily at 2 AM UTC to scrape fresh project data
- ✅ Commits updated `projects.json` and QR codes to the repository
- ✅ Redeploys the GitHub Pages site with new data
- ✅ Only commits when changes are detected

### 4. Manual Update (Optional)

To trigger an immediate update:
1. Go to **Actions** tab in your GitHub repository
2. Select **Deploy to GitHub Pages** workflow
3. Click **Run workflow** → **Run workflow**

## 🎛️ Configuration

### Display Settings

Edit `script.js` to customize:

```javascript
const CONFIG = {
    cycleDuration: 15000,     // 15 seconds per project set
    projectsPerPage: 9,       // 3x3 grid layout
    animationDuration: 500    // Transition speed
};
```

### Scraper Settings

Edit `scraper/scraper.js` to customize:

```javascript
const CONFIG = {
    tagFilter: {
        enabled: true,
        requiredTags: ['makerspace']  // Only include projects with these tags
    },
    excludedTags: ['makerspace', 'fablab', 'williams', 'college'] // Hide these tags from display
};
```

## 🔄 How It Works

1. **Daily Automation**: GitHub Actions runs the scraper every 24 hours
2. **Data Collection**: Scraper visits Williams Makerspace projects page
3. **Content Extraction**: Extracts project titles, authors, images, and tags
4. **Filtering**: Only includes projects tagged with "makerspace"
5. **QR Generation**: Creates QR codes for each project
6. **Data Storage**: Saves everything to `data/projects.json`
7. **Auto-Deploy**: GitHub Pages automatically updates with new data

## 🎨 Display Features

- **Smart Cycling**: 15-second intervals between project sets
- **Wraparound Display**: Always shows exactly 9 projects (duplicates if needed)
- **Progress Indicator**: Yellow progress bar across bottom of screen
- **Project Counter**: Shows current page in top-right corner
- **Responsive Images**: Auto-cropped and optimized for grid layout

## 🔧 Local Development

```bash
# Install scraper dependencies
cd scraper
npm install

# Run scraper locally (development mode - only 5 projects)
npm run dev

# Run scraper in production mode (all projects)
npm start

# Start local server for testing
cd ..
python3 -m http.server 8000
# Visit: http://localhost:8000
```

## 📱 Browser Compatibility

- ✅ Chrome/Chromium
- ✅ Firefox
- ✅ Safari
- ✅ WebKit browsers (Orion, etc.)
- ✅ Edge

## 🚨 Troubleshooting

### Scraper Issues
- Check that Williams Makerspace site is accessible
- Verify project posts have "makerspace" tag
- Review GitHub Actions logs for errors

### Display Issues
- Ensure `data/projects.json` exists and has valid data
- Check browser console for JavaScript errors
- Verify all images are accessible

### GitHub Actions Issues
- Confirm repository has Pages enabled
- Check that workflow has write permissions
- Review Actions tab for error logs

## 📄 License

MIT License - feel free to use and modify for your own institutions!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

---

**Built for Williams College Makerspace** 🛠️ ✨