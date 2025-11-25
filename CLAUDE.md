# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 application using React 19, TypeScript, and Tailwind CSS v4. The project was created with `create-next-app` and follows the App Router architecture.

## Development Commands

- `npm run dev` - Start the development server on http://localhost:3000
- `npm run build` - Build the application for production
- `npm start` - Start the production server

## Architecture

The application uses Next.js App Router with:
- TypeScript for type safety
- Tailwind CSS v4 with PostCSS plugin for styling
- Geist fonts (Sans and Mono) from Google Fonts
- Standard Next.js file structure with `src/app/` directory

### Key Files
- `src/app/layout.tsx` - Root layout with font configuration
- `src/app/page.tsx` - Home page component
- `src/app/globals.css` - Global CSS styles
- `next.config.ts` - Next.js configuration
- `postcss.config.mjs` - PostCSS configuration for Tailwind CSS

### Styling
The project uses Tailwind CSS v4 with the PostCSS plugin. No separate tailwind.config file is present, indicating usage of the new Tailwind CSS v4 approach with built-in configuration.