# piped Project Rules

## Core Principles

1. **BunJS First**: Only use BunJS and prefer its internal features over external libraries
   - Use Bun's built-in APIs (Bun.serve, Bun.file, Bun.shell, etc.)
   - Avoid adding unnecessary npm packages when Bun provides native alternatives
   - Leverage Bun's native performance and TypeScript support

2. **Simplicity & Elegance**: Keep code simple, clean, and self-leveraging
   - The system should use its own endpoints internally where applicable
   - Write code that reflects the simplicity of Unix pipes
   - Prefer readable, straightforward implementations over clever abstractions

3. **Code Quality**: Always apply linting to keep code clean
   - Run linting before committing code
   - Fix all linting errors and warnings
   - Maintain consistent code style throughout the project

4. **Minimal Dependencies**: Built entirely with BunJS and HTML (plus a few assets)
   - Only add dependencies when absolutely necessary
   - Prefer Bun's native capabilities over external libraries
   - Keep the dependency tree as small as possible

5. **Self-Leveraging**: The system should leverage itself
   - Internal pipeline execution should use the same REST endpoints
   - Commands should be composable and reusable
   - The pipeline language parser should use the command endpoints

## Technical Guidelines

- Use Bun.shell for executing Unix commands
- Use Bun.serve for HTTP server
- Use Bun's native file APIs
- Prefer TypeScript strict mode
- Keep React components simple and focused
- Use Tailwind CSS for styling (already configured)

## Project Structure

- `/src` - Main source code
- `/src/components` - React components
- `/src/lib` - Utility functions
- `/styles` - Global styles
- Use Bun's native module resolution
