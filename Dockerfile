# Use the official Node.js image
FROM node:18-alpine

# Create and set the working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your application code
COPY . .

# Expose the port your app runs on (e.g., 3000)
EXPOSE 3000

# The API and worker are separate Compose services.
CMD ["npm", "start"]