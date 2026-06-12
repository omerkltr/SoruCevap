const os = require('os');

function getLocalIP() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const networkInterface of interfaces) {
      if (networkInterface.family === 'IPv4' && !networkInterface.internal) {
        return networkInterface.address;
      }
    }
  }

  return 'localhost';
}

module.exports = { getLocalIP };
