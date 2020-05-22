import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

// setup config
const env = pulumi.getStack(); // reference to this stack
const stackId = `dave/aks/${env}`;
const aksStack = new pulumi.StackReference(stackId);
const kubeConfig = aksStack.getOutput("kubeConfig");
const k8sProvider = new k8s.Provider("k8s", { kubeconfig: kubeConfig  });
const acrSecretName = aksStack.getOutput("acrSecretName") || "docker-credentials";
const azureStorageSecretName = aksStack.getOutput("azureStorageSecretName");
const azureFileShareName = aksStack.getOutput("fileShareName");
const k8sDnsName = aksStack.getOutput("k8sDnsName");
const clusterResourceGroup = aksStack.getOutput("nodeResourceGroup");
const dbConnectionString = "Server=postgres-svc; User Id=admin; Database=identity; Port=5432; Password=P@ssw0rd!; SSL Mode=Prefer; Trust Server Certificate=true;";
const dbConnectionStringList = [
    {name: "ConnectionStrings__ConfigurationDbConnection", value: dbConnectionString},
    {name: "ConnectionStrings__PersistedGrantDbConnection", value: dbConnectionString},
    {name: "ConnectionStrings__IdentityDbConnection", value: dbConnectionString},
    {name: "ConnectionStrings__AdminLogDbConnection", value: dbConnectionString},
    {name: "ConnectionStrings__AdminAuditLogDbConnection", value: dbConnectionString}
];

// output kubeConfig for debugging purposes
let _ = aksStack.getOutput("k8sDnsName").apply(unwrapped => console.log(unwrapped));
//_ = azureFileShareName.apply(unwrapped => console.log("Azure File Share Name: " + unwrapped));
//_ = azureStorageSecretName.apply(unwrapped => console.log("Azure Storage Secret Name: " + unwrapped));

// Common labels
const baseBackEndLabels = { tier: "backend", group: "infrastructure" };
const baseApplicationGroupLabels = {tier: "frontend", group:"application"};

// Add Postgres to AKS Cluster
const postgresLabels = {...{ app: "postgres", role: "db" }, ...baseBackEndLabels};

const postgresPVClaimName = "postgres-pv-claim";
const postgresPersistentVolumeClaim = new k8s.core.v1.PersistentVolumeClaim(postgresPVClaimName,{
    metadata:{ name: postgresPVClaimName},
    spec: {
        storageClassName: aksStack.getOutput("storageClassName"),
        accessModes: ["ReadWriteOnce"],
        resources: {
            requests: {
                storage: "32Gi"
            }
        }
    }
}, {provider: k8sProvider});

const postgresDepName = "postgres-dep";
const postgresDeployment = new k8s.apps.v1.Deployment(postgresDepName, {
    metadata: { 
        name: postgresDepName, 
        labels: postgresLabels
    },
    spec: {
        selector: { matchLabels: postgresLabels },
        replicas: 1,
        revisionHistoryLimit: 2,
        template: {
            metadata: { labels: postgresLabels },
            spec: {
                containers: [{
                    name: "postgres",
                    image: "postgres:alpine",
                    volumeMounts: [{
                        mountPath: "/var/lib/postgresql/data",
                        name: "volume"
                    }],
                    resources: {
                        requests: {
                            cpu: "100m",
                            memory: "100Mi",
                        },
                    },
                    ports: [{ containerPort: 5432 }],
                    env: [
                        {name: "POSTGRES_USER", value: "admin"},
                        {name: "POSTGRES_PASSWORD", value: "P@ssw0rd!"},
                        {name: "POSTGRES_DB", value: "identity"},
                        {name: "PGDATA", value: "/mnt/data/pgdata"}
                    ]
                }],
                volumes:[{
                    name: "volume",
                    persistentVolumeClaim: {
                        claimName: postgresPVClaimName
                    }
                }]
            },
        },
    },
}, {provider: k8sProvider});

const postgresServiceName = "postgres-svc";
const postgresService = new k8s.core.v1.Service(postgresServiceName, 
    {
        metadata: {
            name: postgresServiceName,
            labels: postgresLabels,
        },
        spec: {
            ports: [{ port: 5432, protocol: "TCP"}],
            selector: postgresLabels,
        },
    }, {provider: k8sProvider});

// Add pgAdmin4 to AKS Cluster
const pgAdminLabels = {...{ app: "pgAdmin4", role: "db"}, ...baseBackEndLabels };

const pgadminServiceName = "pgadmin-svc";
const pgAdminService = new k8s.core.v1.Service(pgadminServiceName, {
    metadata: {
        name: pgadminServiceName,
        labels: pgAdminLabels,
    },
    spec: {
        ports: [{ port: 5555, targetPort: 80, protocol: "TCP"}],
        selector: pgAdminLabels,
    },
}, {provider: k8sProvider});

const pgAdminAzureVolumeName = "azure";
const pgAdminDepName = "pgadmin-dep";
const pgAdminDeployment = new k8s.apps.v1.Deployment(pgAdminDepName, {
    metadata: { name: pgAdminDepName },
    spec: {
        selector: { matchLabels: pgAdminLabels },
        replicas: 1,
        revisionHistoryLimit: 2,
        template: {
            metadata: { labels: pgAdminLabels },
            spec: {
                containers: [{
                    name: "pgadmin",
                    image: "dpage/pgadmin4",
                    resources: {
                        requests: {
                            cpu: "100m",
                            memory: "150Mi",
                        },
                        limits: {
                            memory: "200Mi"
                        }
                    },
                    ports: [{ containerPort: 80 }],
                    env: [
                        {name: "PGADMIN_DEFAULT_EMAIL", value: "admin@mydomain.com"},
                        {name: "PGADMIN_DEFAULT_PASSWORD", value: "P@ssw0rd!"},
                        {name: "POSTGRES_USER", value: "admin"},
                        {name: "POSTGRES_PASSWORD", value: "P@ssw0rd!"},
                        {name: "POSTGRES_DB", value: "identity"}
                    ],
                    volumeMounts:[
                        {name: pgAdminAzureVolumeName, mountPath: "/var/lib/pgadmin/azure"}
                    ]
                }],
                volumes: [{
                    name: pgAdminAzureVolumeName,
                    azureFile: {
                        secretName: azureStorageSecretName,
                        shareName: azureFileShareName,
                        readOnly: false
                    }
                }],
            },
        },
    },
}, {provider: k8sProvider, deleteBeforeReplace: true}); // <-- because pgAdmin gets hung up on azureFile PV


// Add Seq to AKS Cluster
const seqLabels = {...{ app: "seq", role: "logingestion"}, ...baseBackEndLabels};
const seqPersistentVolumeClaim = new k8s.core.v1.PersistentVolumeClaim("seq-pv-claim",{
    metadata:{ name: "seq-pv-claim"},
    spec: {
        storageClassName: aksStack.getOutput("storageClassName"),
        accessModes: ["ReadWriteOnce"],
        resources: {
            requests: {
                storage: "32Gi"
            }
        }
    }
}, {provider: k8sProvider});

const seqServiceName = "seq-svc";
const seqService = new k8s.core.v1.Service(seqServiceName, {
    metadata: {
        name: seqServiceName,
        labels: seqLabels,
    },
    spec: {
        ports: [
            { name: "http-seq", port: 5341, targetPort: 80, protocol: "TCP"},
            { name: "udp-sqelf", port: 12201, protocol: "UDP"}],
        selector: seqLabels,
    },
},{provider: k8sProvider});

const seqDeploymentName = "seq-dep";
const seqDeployment = new k8s.apps.v1.Deployment(seqDeploymentName, {
    metadata: { name: seqDeploymentName },
    spec: {
        selector: { matchLabels: seqLabels },
        replicas: 1,
        revisionHistoryLimit: 2,
        template: {
            metadata: { labels: seqLabels },
            spec: {
                volumes: [{
                    name: "seq-pv-storage",
                    persistentVolumeClaim: {
                        claimName: "seq-pv-claim"
                    }
                }],
                containers: [{
                    name: "seq",
                    image: "datalust/seq:preview",
                    resources: {
                        requests: {
                            cpu: "100m",
                            memory: "500Mi",
                        },
                        limits:{
                            memory: "1000Mi"
                        }
                    },
                    ports: [{ containerPort: 80, protocol: "TCP" }],
                    volumeMounts: [{
                        mountPath: "/data",
                        name: "seq-pv-storage"
                    }],
                    env: [{name: "ACCEPT_EULA", value: "Y"}]
                },
                {
                    name: "sqelf",
                    image: "datalust/sqelf",
                    resources: {
                        requests: {
                            cpu: "100m",
                            memory: "100Mi",
                        },
                    },
                    ports: [{containerPort: 12201, protocol: "UDP"}],
                    env: [
                        {name: "ACCEPT_EULA", value: "Y"},
                        {name: "SEQ_ADDRESS", value: "http://localhost:5341"}
                    ]
                }
            ],
            },
        },
    },
}, {provider: k8sProvider});


// Add Identity STS Service to AKS Cluster
const stsLabels = {...{ app: "identity-sts", role: "authentication"}, ...baseApplicationGroupLabels};
const stsDepName = "identity-sts-dep";
const stsDeployment = new k8s.apps.v1.Deployment(stsDepName, {
    metadata: { 
        name: stsDepName,
        labels: stsLabels
    },
    spec: {
        selector: { matchLabels: {app: "identity-sts"} },
        replicas: 1,
        revisionHistoryLimit: 2,
        template: {
            metadata: { labels: stsLabels },
            spec: {
                containers: [{
                    name: "identity-sts",
                    image: "depthconsulting.azurecr.io/skoruba-identityserver4-sts-identity:latest",
                    resources: {
                        requests: {
                            cpu: "100m",
                            memory: "200Mi",
                        },
                        limits:{
                            memory: "300Mi"
                        }
                    },
                    ports: [{ containerPort: 80, protocol: "TCP" }],
                    env: [
                        {name: "ASPNETCORE_ENVIRONMENT", value: "Development"},
                        {name: "SEQ_URL", value: "http://seq-svc:5341"},
                        {name: "Serilog__WriteTo__1__Args__serverUrl", value: "http://seq-svc:5341"},
                        {name: "AdminConfiguration__IdentityAdminBaseUrl", value: "https://auth-admin.codingwithdave.xyz"},
                        {name: "ASPNETCORE_URLS", value: "http://+:80"}
                    ].concat(dbConnectionStringList)
                }],
                imagePullSecrets: [{name: acrSecretName }]
            },
        },
    },
}, {provider: k8sProvider});

const stsServiceName = "identity-sts-svc";
const stsService = new k8s.core.v1.Service(stsServiceName, {
    metadata: {
        name: stsServiceName,
        labels: {app: "identity-sts"},
    },
    spec: {
        ports: [
            { name: "http", port: 80, targetPort: 80, protocol: "TCP"}
        ],
        selector: {app: "identity-sts"},
    },
},{provider: k8sProvider});

// Add Auth Admin Application to AKS Cluster
const adminLabels = {...{ app: "identity-admin", role: "authentication"}, ...baseApplicationGroupLabels};
const adminDepName = "identity-admin-dep";
const adminDeployment = new k8s.apps.v1.Deployment(adminDepName, {
    metadata: { 
        name: adminDepName,
        labels: adminLabels
    },
    spec: {
        selector: { matchLabels: {app: "identity-admin"} },
        replicas: 1,
        revisionHistoryLimit: 2,
        template: {
            metadata: { labels: adminLabels },
            spec: {
                containers: [{
                    name: "identity-admin",
                    image: "depthconsulting.azurecr.io/skoruba-identityserver4-admin:latest",
                    resources: {
                        requests: {
                            cpu: "100m",
                            memory: "200Mi",
                        },
                        limits:{
                            memory: "300Mi"
                        }
                    },
                    ports: [{ containerPort: 80, protocol: "TCP" }],
                    env: [
                        {name: "ASPNETCORE_ENVIRONMENT", value: "Development"},
                        {name: "SEQ_URL", value: "http://seq-svc:5341"},
                        {name: "Serilog__WriteTo__1__Args__serverUrl", value: "http://seq-svc:5341"},
                        {name: "AdminConfiguration__IdentityServerBaseUrl", value: "https://auth.codingwithdave.xyz"},
                        {name: "AdminConfiguration__IdentityAdminRedirectUri", value: "https://auth-admin.codingwithdave.xyz/signin-oidc"},
                        {name: "AdminConfiguration__RequireHttpsMetadata", value: "false"},
                        {name: "ASPNETCORE_URLS", value: "http://+:80"}
                    ].concat(dbConnectionStringList),
                }],
                imagePullSecrets: [{name: acrSecretName }]
            },
        },
    },
}, {provider: k8sProvider});

const adminServiceName = "identity-admin-svc";
const adminService = new k8s.core.v1.Service(adminServiceName, {
    metadata: {
        name: adminServiceName,
        labels: {app: "identity-admin"},
    },
    spec: {
        ports: [{ port: 80, targetPort: 80, protocol: "TCP"}],
        selector: {app: "identity-admin"},
    },
},{provider: k8sProvider});

// Add Auth Admin API to AKS Cluster
const adminApiLabels = {...{ app: "identity-admin-api", role: "authentication"}, ...baseApplicationGroupLabels};
const adminApiDepName = "identity-admin-api-dep";
const adminApiDeployment = new k8s.apps.v1.Deployment(adminApiDepName, {
    metadata: { 
      name: adminApiDepName,
      labels: adminApiLabels
    },
    spec: {
        selector: { matchLabels: {app: "identity-admin-api"} },
        replicas: 1,
        revisionHistoryLimit: 2,
        template: {
            metadata: { labels: adminApiLabels },
            spec: {
                containers: [{
                    name: "identity-admin-api",
                    image: "depthconsulting.azurecr.io/skoruba-identityserver4-admin-api:latest",
                    resources: {
                        requests: {
                            cpu: "100m",
                            memory: "200Mi",
                        },
                        limits:{
                            memory: "300Mi"
                        }
                    },
                    ports: [{ containerPort: 80, protocol: "TCP" }],
                    env: [
                        {name: "ASPNETCORE_ENVIRONMENT", value: "Development"},
                        {name: "SEQ_URL", value: "http://seq-svc:5341"},
                        {name: "Serilog__WriteTo__1__Args__serverUrl", value: "http://seq-svc:5341"},
                        {name: "AdminApiConfiguration__IdentityServerBaseUrl", value: "https://auth.codingwithdave.xyz"},
                        {name: "AdminApiConfiguration__ApiBaseUrl", value: "https://auth-admin-api.codingwithdave.xyz"},
                        {name: "ASPNETCORE_URLS", value: "http://+:80"}
                    ].concat(dbConnectionStringList)
                }],
                imagePullSecrets: [{name: acrSecretName }]
            },
        },
    },
}, {provider: k8sProvider});

const adminApiServiceName = "identity-admin-api-svc";
const adminApiService = new k8s.core.v1.Service(adminApiServiceName, {
    metadata: {
        name: adminApiServiceName,
        labels: {app: "identity-admin-api"},
    },
    spec: {
        ports: [{ port: 80, targetPort: 80, protocol: "TCP"}],
        selector: {app: "identity-admin-api"},
    },
},{provider: k8sProvider});


// Deploy ingress-controller using helm to AKS Cluster
const nginxIngress = new k8s.helm.v3.Chart("nginx", {
    chart: "nginx-ingress-controller",
    namespace: "kube-system",
    repo: "bitnami",
    values: {
        annotations: {
            "service.beta.kubernetes.io/azure-dns-label-name": k8sDnsName,
            "service.beta.kubernetes.io/azure-load-balancer-resource-group": clusterResourceGroup,

        },
        resources: { requests : {memory: "150Mi", cpu: "100m"}},
        serviceType: "LoadBalancer",
        nodeCount: 1,
    }
}, {provider: k8sProvider });

// setup cert-manager
const certManager = new k8s.yaml.ConfigFile("cert-manager", {
    file: "https://github.com/jetstack/cert-manager/releases/download/v0.14.1/cert-manager.yaml",
 }, {provider: k8sProvider});

// create certificate issuers for lets-encrypt
const caClusterIssuer = new k8s.yaml.ConfigFile("ca-cluster-issuer", {
    file: "ca-cluster-issuer.yaml",
 }, {provider: k8sProvider, dependsOn: certManager});

const ingressName = "identity-ingress";
const options = {
    metadata:{
        name: ingressName,
        annotations: {
            "kubernetes.io/ingress.class": "nginx", // <-- we are using an nginx ingress controller
            "cert-manager.io/cluster-issuer": "letsencrypt-staging" // <-- consider your rate limits
        }
    },
    spec: {
        tls:[{ // <-- domains to add to certificate
            hosts:[
                "auth.codingwithdave.xyz",
                "auth-admin.codingwithdave.xyz",
                "auth-admin-api.codingwithdave.xyz"
              ],
            secretName: "tls-secret-certificate"
          }],
        rules: [
            {
                host: "auth.codingwithdave.xyz",
                http:{
                    paths: [{
                        path: "/",
                        backend: {
                            serviceName: "identity-sts-svc",
                            servicePort: 80
                        }
                    }]
                }
            },
            {
                host: "auth-admin.codingwithdave.xyz",
                http:{
                    paths: [{
                        path: "/",
                        backend: {
                            serviceName: "identity-admin-svc",
                            servicePort: 80
                        }
                    }]
                }
            },
            {
                host: "auth-admin-api.codingwithdave.xyz",
                http:{
                    paths: [{
                        path: "/",
                        backend: {
                            serviceName: "identity-admin-api-svc",
                            servicePort: 80
                        }
                    }]
                }
            }
        ]
    }
};
const ingressFrontEnd = new k8s.networking.v1beta1.Ingress(ingressName,options,{provider: k8sProvider});

//const nginxIngressControllerConfigMap = new k8s.core.v1.ConfigMap("nginx-nginx-ingress-controller", {
//    metadata:{
//        annotations: {},
//        name: "nginx-nginx-ingress-controller",
//        labels: {"k8s-app": "nginx-ingress-controller"},
//        namespace:"kube-system"
//    },
//    data: {
//        "proxy-buffer-size": "128k",
//        "proxy-buffers": "8 128k"
//    }
//},{provider: k8sProvider});