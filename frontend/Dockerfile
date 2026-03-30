FROM node:20-alpine

WORKDIR /app

# Install dependencies as a separate layer so they are cached between rebuilds.
# The node_modules directory is preserved by an anonymous volume in docker-compose,
# so the bind-mounted source tree does not overwrite the installed packages.
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
