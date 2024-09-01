# Introduction

The Buyer Mock Engine is a Node.js server that handles the business logic required by the protocol server. It serves data to the frontend of the protocol server and also connects to the protocol server for data exchange.

# Repository Structure

- src/
- config/
- .env-sample
- Readme.md

# Change Log

    This is the version 0.0.1 of the buyer mock engine

# Contribution

Contributions can be made using the following branching structure:

```
    Branches: master -> Integ -> feat/fix/feature
```

# Dependency

- Sandbox-UI
- Protocol Server

# Pre-requisite

- Node.js
- git
- npm

# How to run - local

- Clone the repo [https://github.com/ONDC-Official/buyer-mock-engine]

```
git clone https://github.com/ONDC-Official/buyer-mock-engine
```

- Checkout to master branch

```
git checkout master
```

- Install dependencies

```
npm i
```

- Create a .env file with the provided .env-sample file
- Run the application

```
npm run dev
```
