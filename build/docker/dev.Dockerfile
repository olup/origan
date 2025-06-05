FROM origan-node-base

WORKDIR /app

# Install dependencies using cache mount and shared store

# Copy source code
COPY . .

RUN pnpm install --frozen-lockfile

# Command to keep container running
CMD ["tail", "-f", "/dev/null"]
