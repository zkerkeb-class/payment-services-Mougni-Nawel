// utils/metrics.js - Configuration complète des métriques
const client = require('prom-client');
const express = require('express');
const os = require('os');
const fs = require('fs');

// Configuration du registre avec préfixe par service
let servicePrefix = '';

function initializeMetrics(serviceName) {
  servicePrefix = serviceName;
  
  // Collecte automatique des métriques par défaut (CPU, mémoire, etc.)
  const collectDefaultMetrics = client.collectDefaultMetrics;
  collectDefaultMetrics({ 
    timeout: 5000,
    prefix: `${serviceName}_`,
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  });
}

// 📊 MÉTRIQUES PERSONNALISÉES

// 1. Compteur de requêtes HTTP
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP',
  labelNames: ['method', 'route', 'status_code', 'service']
});

// 2. Histogramme de latence HTTP
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

// 3. Gauge pour l'utilisation CPU personnalisée
const cpuUsageGauge = new client.Gauge({
  name: 'process_cpu_usage_percent',
  help: 'Utilisation CPU du processus en pourcentage',
  labelNames: ['service'],
  collect() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - Math.floor(100 * idle / total);
    
    this.set({ service: servicePrefix }, usage);
  }
});

// 4. Gauge pour l'utilisation mémoire
const memoryUsageGauge = new client.Gauge({
  name: 'process_memory_usage_bytes',
  help: 'Utilisation mémoire du processus en bytes',
  labelNames: ['type', 'service'],
  collect() {
    const memUsage = process.memoryUsage();
    this.set({ type: 'rss', service: servicePrefix }, memUsage.rss);
    this.set({ type: 'heapUsed', service: servicePrefix }, memUsage.heapUsed);
    this.set({ type: 'heapTotal', service: servicePrefix }, memUsage.heapTotal);
    this.set({ type: 'external', service: servicePrefix }, memUsage.external);
  }
});

// 5. Gauge pour l'utilisation disque
const diskUsageGauge = new client.Gauge({
  name: 'disk_usage_bytes',
  help: 'Utilisation disque en bytes',
  labelNames: ['path', 'type', 'service'],
  async collect() {
    try {
      const diskusage = require('diskusage');
      const { total, free } = diskusage.checkSync('/');
      
      this.set({ 
        path: '/', 
        type: 'used', 
        service: servicePrefix 
      }, total - free);
      
      this.set({ 
        path: '/', 
        type: 'total', 
        service: servicePrefix 
      }, total);
      
      this.set({ 
        path: '/', 
        type: 'free', 
        service: servicePrefix 
      }, free);
    } catch (error) {
      console.error('Erreur lors de la collecte des métriques disque:', error);
      this.set({ path: '/', type: 'error', service: servicePrefix }, 1);
    }
  }
});

// 6. Compteur d'erreurs spécifique
const errorCounter = new client.Counter({
  name: 'application_errors_total',
  help: 'Nombre total d\'erreurs de l\'application',
  labelNames: ['type', 'service']
});

// 7. Gauge pour les connexions actives
const activeConnectionsGauge = new client.Gauge({
  name: 'active_connections',
  help: 'Nombre de connexions actives',
  labelNames: ['service']
});

// 🛠️ MIDDLEWARE
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();
  
  // Incrémenter les connexions actives
  activeConnectionsGauge.labels(servicePrefix).inc();
  
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const statusCode = res.statusCode.toString();
    const method = req.method;
    const route = req.route ? req.route.path : req.path;
    
    // Enregistrer les métriques
    httpRequestDuration
      .labels(method, route, statusCode, servicePrefix)
      .observe(duration);
    
    httpRequestsTotal
      .labels(method, route, statusCode, servicePrefix)
      .inc();
    
    // Compter les erreurs
    if (res.statusCode >= 400) {
      errorCounter
        .labels(res.statusCode >= 500 ? 'server_error' : 'client_error', servicePrefix)
        .inc();
    }
    
    // Décrémenter les connexions actives
    activeConnectionsGauge.labels(servicePrefix).dec();
  });
  
  next();
}

// 🚀 ROUTER MÉTRIQUES
const metricsRouter = express.Router();

metricsRouter.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (error) {
    console.error('Erreur lors de la collecte des métriques:', error);
    res.status(500).end('Erreur lors de la collecte des métriques');
  }
});

// Endpoint pour les métriques de santé
metricsRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: servicePrefix,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});

// 🎯 FONCTIONS UTILITAIRES

function recordError(errorType, error) {
  errorCounter.labels(errorType, servicePrefix).inc();
  console.error(`[${servicePrefix}] ${errorType}:`, error);
}

function recordCustomMetric(name, value, labels = {}) {
  let metric = client.register.getSingleMetric(name);
  if (!metric) {
    metric = new client.Gauge({
      name: name,
      help: `Métrique personnalisée: ${name}`,
      labelNames: [...Object.keys(labels), 'service']
    });
  }
  metric.set({ ...labels, service: servicePrefix }, value);
}

module.exports = {
  initializeMetrics,
  metricsRouter,
  metricsMiddleware,
  recordError,
  recordCustomMetric,
  metrics: {
    httpRequestsTotal,
    httpRequestDuration,
    cpuUsageGauge,
    memoryUsageGauge,
    diskUsageGauge,
    errorCounter,
    activeConnectionsGauge
  }
};