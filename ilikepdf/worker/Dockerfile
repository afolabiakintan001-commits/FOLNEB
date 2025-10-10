FROM node:20-bullseye
# tools: ghostscript, libreoffice, imagemagick, tesseract, zip
RUN apt-get update && apt-get install -y \
  ghostscript libreoffice imagemagick tesseract-ocr zip && \
  rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
CMD ["npm","run","dev"]

