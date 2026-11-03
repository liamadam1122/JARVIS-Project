FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY brain-host.mjs cloud.mjs chat.mjs secrets.mjs shared-brain.mjs brain.public.json ./
RUN npm install --omit=dev
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787
CMD ["node", "brain-host.mjs"]
