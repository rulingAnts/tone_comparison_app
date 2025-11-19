#!/usr/bin/env python3
"""
Configure PWA for GitHub Pages deployment
Updates paths in manifest.json and service-worker.js based on base path
"""

import json
import sys
import os

def update_manifest(base_path):
    """Update manifest.json with correct paths"""
    manifest_path = 'public/manifest.json'
    
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)
    
    # Update paths
    manifest['start_url'] = f'{base_path}/'
    manifest['scope'] = f'{base_path}/'
    
    # Update icon paths
    for icon in manifest.get('icons', []):
        if not icon['src'].startswith('http'):
            icon['src'] = f"{base_path}/{icon['src'].lstrip('/')}"
    
    # Update shortcuts
    for shortcut in manifest.get('shortcuts', []):
        if 'url' in shortcut:
            shortcut['url'] = f"{base_path}/{shortcut['url'].lstrip('/')}"
        for icon in shortcut.get('icons', []):
            if not icon['src'].startswith('http'):
                icon['src'] = f"{base_path}/{icon['src'].lstrip('/')}"
    
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    
    print(f'✅ Updated manifest.json with base path: {base_path}')

def update_service_worker(base_path):
    """Update service-worker.js with correct paths"""
    sw_path = 'public/service-worker.js'
    
    with open(sw_path, 'r') as f:
        content = f.read()
    
    # Add BASE_PATH constant if not exists
    if 'const BASE_PATH' not in content:
        # Insert after first line (version declaration)
        lines = content.split('\n')
        lines.insert(1, f"const BASE_PATH = '{base_path}';")
        content = '\n'.join(lines)
    else:
        # Update existing BASE_PATH
        import re
        content = re.sub(
            r"const BASE_PATH = '[^']*';",
            f"const BASE_PATH = '{base_path}';",
            content
        )
    
    # Update STATIC_ASSETS paths
    assets_to_update = [
        '/',
        '/index.html',
        '/compatibility.js',
        '/renderer.js',
        '/api-client.js',
        '/storage.js',
        '/bundle-processor.js',
        '/localization.js',
        '/manifest.json'
    ]
    
    for asset in assets_to_update:
        old_path = f"'{asset}'"
        new_path = f"BASE_PATH + '{asset}'"
        content = content.replace(old_path, new_path)
    
    with open(sw_path, 'w') as f:
        f.write(content)
    
    print(f'✅ Updated service-worker.js with base path: {base_path}')

def update_html(base_path):
    """Add base tag to HTML"""
    html_path = 'public/index.html'
    
    with open(html_path, 'r') as f:
        content = f.read()
    
    # Add base tag if not exists
    if '<base href' not in content:
        base_tag = f'  <base href="{base_path}/">\n'
        content = content.replace('<meta charset="UTF-8">', f'<meta charset="UTF-8">\n{base_tag}', 1)
        
        with open(html_path, 'w') as f:
            f.write(content)
        
        print(f'✅ Updated index.html with base tag: {base_path}/')
    else:
        print('⚠️  index.html already has base tag')

def main():
    if len(sys.argv) < 2:
        print('Usage: python3 configure-github-pages.py <base-path>')
        print('Examples:')
        print('  python3 configure-github-pages.py ""  # For root deployment')
        print('  python3 configure-github-pages.py "/tone_comparison_app/desktop_matching_app/public"  # For subdirectory')
        sys.exit(1)
    
    base_path = sys.argv[1].rstrip('/')
    
    print(f'\n🔧 Configuring PWA for GitHub Pages...')
    print(f'📁 Base path: {base_path if base_path else "/ (root)"}')
    print()
    
    # Change to script directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Update files
    update_manifest(base_path)
    update_service_worker(base_path)
    update_html(base_path)
    
    print()
    print('✨ Configuration complete!')
    print()
    print('Next steps:')
    print('1. Test locally: python3 serve-pwa.py')
    print('2. Commit changes: git add public/ && git commit -m "Configure for GitHub Pages"')
    print('3. Push: git push origin main')
    print('4. Enable GitHub Pages in repository settings')
    print()

if __name__ == '__main__':
    main()
