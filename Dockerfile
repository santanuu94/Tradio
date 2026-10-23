FROM node:20-slim

WORKDIR /app

# Ensure build tooling & devDependencies (Tailwind, TypeScript) are installed
ENV NODE_ENV=development

# Copy package manifests
COPY package.json ./
COPY web/package.json ./web/

# Install web dependencies including devDependencies
RUN npm --prefix web install --include=dev

# Copy all project source code
COPY . .

# Run data bundling and Next.js production build
RUN npm --prefix web run build

# Switch to production runtime
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "start.mjs"]
