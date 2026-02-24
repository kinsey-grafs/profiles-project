# Kubernetes Deployment

Deploy the profiles-demo services to Kubernetes.

## Prerequisites

- Kubernetes cluster with Tempo, Pyroscope, and OpenTelemetry Collector (or Alloy) in an `observability` namespace
- Built images: `profiles-demo-backend:latest`, `profiles-demo-api-gateway:latest`

## Build and push images

```bash
docker build -t profiles-demo-backend:latest -f services/backend/Dockerfile .
docker build -t profiles-demo-api-gateway:latest -f services/api-gateway/Dockerfile .
# Push to your registry and update image references in the deployment YAMLs
```

## Update config

Edit `k8s/configmap.yaml` to point to your OTLP collector and Pyroscope endpoints.

## Deploy

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/api-gateway-deployment.yaml
```

## Optional: secrets for Grafana Cloud

If using Grafana Cloud, create secrets for OTLP and Pyroscope auth:

```bash
kubectl create secret generic otel-auth --from-literal=password=<api-key> -n profiles-demo
kubectl create secret generic pyroscope-auth --from-literal=user=<user> --from-literal=password=<api-key> -n profiles-demo
```

Then reference in the deployment env.
