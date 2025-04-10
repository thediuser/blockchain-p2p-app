const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

// Suivi des connexions
const connectedNodes = new Map(); // nodeId -> websocket

console.log(`Serveur de signalisation démarré sur le port ${PORT}`);

wss.on('connection', (ws) => {
  let nodeId = null;
  
  console.log('Nouvelle connexion entrante');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Traiter différents types de messages
      switch (data.type) {
        case 'register':
          // Un nœud s'enregistre avec son ID
          nodeId = data.nodeId;
          connectedNodes.set(nodeId, ws);
          console.log(`Nœud enregistré: ${nodeId}`);
          
          // Informer ce nœud des autres nœuds connectés
          const peers = Array.from(connectedNodes.keys()).filter(id => id !== nodeId);
          ws.send(JSON.stringify({
            type: 'peers',
            peers: peers
          }));
          
          // Informer les autres nœuds de ce nouveau nœud
          broadcastExcept(JSON.stringify({
            type: 'new_peer',
            nodeId: nodeId
          }), nodeId);
          break;
          
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // Relayer les messages de signalisation pour WebRTC
          if (data.target && connectedNodes.has(data.target)) {
            console.log(`Relai de ${data.type} de ${nodeId} à ${data.target}`);
            connectedNodes.get(data.target).send(JSON.stringify({
              ...data,
              source: nodeId
            }));
          }
          break;
      }
    } catch (error) {
      console.error('Erreur de traitement du message:', error);
    }
  });
  
  ws.on('close', () => {
    if (nodeId) {
      console.log(`Nœud déconnecté: ${nodeId}`);
      connectedNodes.delete(nodeId);
      
      // Informer les autres nœuds de la déconnexion
      broadcastExcept(JSON.stringify({
        type: 'peer_disconnected',
        nodeId: nodeId
      }), nodeId);
    }
  });
  
  // Fonction pour diffuser à tous les nœuds sauf à un
  function broadcastExcept(message, exceptNodeId) {
    connectedNodes.forEach((clientWs, clientId) => {
      if (clientId !== exceptNodeId && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(message);
      }
    });
  }
});

// Pour Glitch, Heroku et autres plateformes - garder le serveur actif
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'ping' }));
    }
  });
}, 30000);

// Gestionnaire pour les plateformes comme Heroku
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Serveur de signalisation blockchain P2P en cours d\'exécution\n');
});

// Si un port spécifique est demandé par la plateforme
if (process.env.PORT) {
  server.listen(process.env.PORT, () => {
    console.log(`Serveur HTTP démarré sur le port ${process.env.PORT}`);
  });
}

// Gestion des erreurs et arrêt propre
process.on('SIGINT', () => {
  wss.close(() => {
    console.log('Serveur de signalisation arrêté');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Erreur non gérée:', err);
});
