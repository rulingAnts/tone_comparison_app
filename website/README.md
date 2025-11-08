# Tone Matching Suite Website

This directory contains the user-facing website for Tone Matching Suite, designed for field linguists studying tone languages.

## Files

- **index.html** - Main landing page with overview, features, and workflow
- **downloads.html** - Download links for all platforms with installation instructions
- **getting-started.html** - Simplified getting started guide for non-technical users
- **workflow-guide.html** - Detailed step-by-step instructions for each application
- **faq.html** - Frequently asked questions and troubleshooting
- **css/style.css** - Stylesheet for all pages
- **images/** - Directory for screenshots and images (currently contains placeholders)
- **.nojekyll** - Tells GitHub Pages not to process with Jekyll

## Target Audience

The website is designed for:
- Field linguists working on tone language documentation
- Native speakers participating in phonology analysis
- Language development teams (especially SIL)
- Researchers who may not be highly technical

## Design Principles

1. **Simple language** - Avoids technical jargon where possible
2. **Clear structure** - Logical flow from overview to detailed instructions
3. **Accessible** - Responsive design works on mobile and desktop
4. **Visual** - Uses placeholders for screenshots (to be replaced with actual screenshots)
5. **Practical** - Focuses on workflows and real-world usage

## Screenshot Placeholders

The following screenshots need to be added to the `images/` directory:

1. **Bundler App:**
   - Main interface showing XML selection, audio folder, and settings
   
2. **Desktop Matching App:**
   - Tone classification screen with current word and tone group options
   
3. **Mobile App:**
   - Tone matching interface on Android
   - Tone group selection with pictures
   
4. **Comparison App:**
   - Analysis results showing statistics and disagreement table

## Publishing to GitHub Pages

To publish this website:

1. **Option A: Use the `docs` folder (recommended)**
   ```bash
   # Copy website contents to docs/ in the repository root
   cp -r website/* docs/
   ```
   Then in GitHub repository settings:
   - Go to Settings → Pages
   - Set Source to "Deploy from a branch"
   - Set Branch to "main" and folder to "/docs"

2. **Option B: Use a gh-pages branch**
   ```bash
   # Create and switch to gh-pages branch
   git checkout --orphan gh-pages
   git rm -rf .
   cp -r website/* .
   git add .
   git commit -m "Add website"
   git push origin gh-pages
   ```
   Then in GitHub repository settings:
   - Go to Settings → Pages
   - Set Source to "Deploy from a branch"
   - Set Branch to "gh-pages" and folder to "/ (root)"

3. **Option C: Use GitHub Actions**
   - Configure a GitHub Actions workflow to deploy from the website/ directory

## Local Testing

To test the website locally:

1. **Using Python:**
   ```bash
   cd website
   python3 -m http.server 8000
   # Visit http://localhost:8000
   ```

2. **Using Node.js:**
   ```bash
   cd website
   npx http-server -p 8000
   # Visit http://localhost:8000
   ```

3. **Using PHP:**
   ```bash
   cd website
   php -S localhost:8000
   # Visit http://localhost:8000
   ```

## Updating Download Links

The downloads.html file currently contains placeholder links. To update:

1. Create a GitHub Release (tag: v1.0.0)
2. Upload all installer files to the release
3. Get the URLs from the release page
4. Update the href attributes in downloads.html

Example URL format:
```
https://github.com/rulingAnts/tone_comparison_app/releases/download/v1.0.0/Tone-Matching-Bundler-Setup-1.0.0.exe
```

## Maintenance

To update the website:

1. Edit HTML files directly
2. Update screenshots in the images/ directory
3. Modify CSS for styling changes
4. Test locally before publishing
5. Commit and push changes
6. If using GitHub Pages, changes will automatically deploy

## License

Same license as the main Tone Matching Suite project.
