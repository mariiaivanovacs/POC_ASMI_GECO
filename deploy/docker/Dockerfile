# Both ASMI POCs in one container, each served by `vite preview` (which also hosts the server-side Qwen relay /api/qwen).
# Build context = the poc/ folder.  DASHSCOPE_API_KEY is supplied at run time (env_file), never baked into the image.
FROM node:22-slim
WORKDIR /app
# package.json only: the committed lockfiles were generated on macOS and omit the Linux rollup/esbuild binaries
COPY helmdocs/package.json helmdocs/
COPY helmlearn/package.json helmlearn/
RUN cd helmdocs && npm install --no-audit --no-fund --silent && cd ../helmlearn && npm install --no-audit --no-fund --silent
COPY helmdocs helmdocs
COPY helmlearn helmlearn
RUN rm -f helmdocs/package-lock.json helmlearn/package-lock.json
RUN cd helmdocs && npm run build >/dev/null && cd ../helmlearn && npm run build >/dev/null
RUN chown -R node:node /app
USER node
EXPOSE 4173 4174
CMD ["sh", "-c", "cd /app/helmdocs && npx vite preview --host 0.0.0.0 --port 4174 --strictPort & cd /app/helmlearn && npx vite preview --host 0.0.0.0 --port 4173 --strictPort & wait"]
