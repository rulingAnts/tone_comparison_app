# Contributing to Tone Matching App

Thank you for your interest in contributing to the Tone Matching App! This document provides guidelines for contributing to the project.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Respect privacy and security

## How to Contribute

### Reporting Bugs

1. **Check existing issues** to avoid duplicates
2. **Create a new issue** with:
   - Clear title describing the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Environment details (OS, versions, etc.)

### Suggesting Features

1. **Check existing issues** and feature requests
2. **Create a new issue** with:
   - Clear description of the feature
   - Use case and benefits
   - Potential implementation approach
   - Mockups or examples if applicable

### Contributing Code

#### 1. Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/tone_matching_app.git
cd tone_matching_app
```

#### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b bugfix/issue-number-description
```

Branch naming conventions:
- `feature/` - New features
- `bugfix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/updates

#### 3. Make Changes

Follow these guidelines:

**Code Style:**
- Flutter/Dart: Follow [Effective Dart](https://dart.dev/guides/language/effective-dart)
- JavaScript: Use ES6+ features, async/await for async code
- Use meaningful variable and function names
- Add comments for complex logic

**Testing:**
- Add tests for new features
- Ensure existing tests pass
- Test on multiple platforms if applicable

**Documentation:**
- Update README.md if needed
- Add/update code comments
- Update user guides for UI changes

#### 4. Commit Changes

```bash
git add .
git commit -m "Brief description of changes

- Detail 1
- Detail 2
- Fixes #issue-number (if applicable)"
```

Commit message guidelines:
- Use present tense ("Add feature" not "Added feature")
- Be descriptive but concise
- Reference issue numbers when applicable

#### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub with:
- Clear title and description
- Reference to related issues
- Screenshots for UI changes
- Testing notes

### Review Process

1. Maintainers will review your PR
2. Address any requested changes
3. Once approved, your PR will be merged

## Development Guidelines

### Mobile App (Flutter)

**File Organization:**
```
lib/
├── models/        # Data models
├── services/      # Business logic
├── screens/       # Full-screen widgets
├── widgets/       # Reusable components
└── main.dart      # Entry point
```

**State Management:**
- Use Provider for global state
- Use StatefulWidget for local state
- Keep widgets focused and single-purpose

**Best Practices:**
- Use `const` constructors where possible
- Extract complex widgets into separate files
- Handle errors gracefully
- Provide user feedback for long operations

### Desktop Apps (Electron)

**File Organization:**
```
src/          # Main process
public/       # Renderer process (HTML/JS)
```

**IPC Communication:**
- Use `ipcRenderer.invoke()` for async operations
- Handle errors in both main and renderer processes
- Validate user input before IPC calls

**Best Practices:**
- Separate business logic from UI
- Use async/await for file operations
- Provide progress feedback for long operations
- Handle edge cases (missing files, malformed data)

## Testing

### Mobile App

```bash
cd mobile_app
flutter test
```

**Test Coverage:**
- Unit tests for models and services
- Widget tests for UI components
- Integration tests for workflows

### Desktop Apps

```bash
cd bundler_app  # or comparison_app
npm test
```

**Manual Testing:**
- Test on target platforms
- Test with real data
- Test error conditions

## Documentation

### Code Documentation

**Dart:**
```dart
/// Brief description
///
/// Detailed description with examples if needed
///
/// Parameters:
/// - [param1]: Description
///
/// Returns: Description
String exampleFunction(String param1) {
  // Implementation
}
```

**JavaScript:**
```javascript
/**
 * Brief description
 *
 * @param {string} param1 - Description
 * @returns {Promise<Object>} Description
 */
async function exampleFunction(param1) {
  // Implementation
}
```

### User Documentation

Update relevant documentation:
- `README.md` - Overview and quick start
- `docs/USER_GUIDE.md` - User workflows
- `docs/ARCHITECTURE.md` - Technical details
- `docs/DEVELOPMENT.md` - Developer setup

## Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows project style guidelines
- [ ] All tests pass
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] Commit messages are clear
- [ ] No unnecessary files included (check .gitignore)
- [ ] PR description clearly explains changes
- [ ] Tested on relevant platforms

## Areas for Contribution

We especially welcome contributions in:

### High Priority
- [ ] Unit and integration tests
- [ ] Error handling improvements
- [ ] Performance optimizations
- [ ] Accessibility improvements
- [ ] Cross-platform testing

### Features
- [ ] Group reorganization UI (mobile app)
- [ ] Periodic review workflow (mobile app)
- [ ] Batch bundle creation (bundler app)
- [ ] Manual conflict resolution (comparison app)
- [ ] Audio waveform visualization
- [ ] Undo/redo functionality

### Documentation
- [ ] Video tutorials
- [ ] Translation guides
- [ ] API documentation
- [ ] Architecture diagrams
- [ ] Example datasets

### Infrastructure
- [ ] CI/CD pipeline
- [ ] Automated testing
- [ ] Build optimization
- [ ] Release automation

## Questions?

- Open a discussion on GitHub
- Check existing documentation
- Review closed issues and PRs
- Contact maintainers

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

## Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

Thank you for contributing to the Tone Matching App!
