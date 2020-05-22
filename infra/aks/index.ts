import * as azure from "@pulumi/azure";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as azuread from "@pulumi/azuread";
import * as helpers from "./helpers";

// Import some stack configuration and export used configuration variables for the AKS stack.
const config = new pulumi.Config();
const password = config.requireSecret("password");
const sshPublicKey = config.require("sshPublicKey");
export const stackLocation = config.get("stackLocation") || (config.get("azure:location") || "WestUS");
export const nodeCount = config.getNumber("nodeCount") || 2;
export const nodeSize = config.get("nodeSize") || "Standard_B2s";
export const storageClassName = "managed-premium";
export const resourceGroupName = "rg_identity_dev_zwus_aks";
export const publicIpAddressName = "pip_identity_dev_zwus_aks";
export const k8sDnsName = "put-yours-here"; // DNS name label prefix
export const acrSecretName = "docker-credentials";
export const azureStorageSecretName = "azure-storage-secret";

const clientConfig = pulumi.output(azure.core.getClientConfig());
export const subscriptionId = clientConfig.subscriptionId;
// -or-
const anotherSubscriptionId = azure.config.subscriptionId;

// Get reference to pre-existing Azure ResourceGroup
// get the Azure Resource Group
var resouceGroupId:pulumi.Output<string> = pulumi.interpolate `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;
const resourceGroup = azure.core.ResourceGroup.get(resourceGroupName, resouceGroupId);

// Create AAD Application and Service Principal for AKS Cluster to use to create resources in the subscription
// https://github.com/pulumi/examples/blob/master/azure-ts-aks-helm/README.md
// Create the AD service principal for the k8s cluster.
const adApp = new azuread.Application("aksSSO");
export const adAppId = adApp.applicationId;

const adSp = new azuread.ServicePrincipal("aksSSOSp", { applicationId: adApp.applicationId });
export const adSpId = adSp.id;

const adSpPassword:any = new azuread.ServicePrincipalPassword("aksSpPassword", {
    servicePrincipalId: adSpId,
    value: password,
    endDate: "2099-01-01T00:00:00Z"
});

// Create storage account for Azure Files
const storageAccountK8s = new azure.storage.Account("identity",{
    resourceGroupName: resourceGroupName,
    accountTier: "Standard",
    accountReplicationType: "LRS",
});

export const storageAccountName = storageAccountK8s.name;
export const storageAccountKeyPrimary = pulumi.secret(storageAccountK8s.primaryAccessKey);
export const storageAccountKeySecondary = pulumi.secret(storageAccountK8s.secondaryAccessKey);
export const storageAccountConnectionStringPrimary = pulumi.secret(storageAccountK8s.primaryConnectionString);
export const storageAccountConnectionStringSecondary = pulumi.secret(storageAccountK8s.secondaryConnectionString);

const fileShare = new azure.storage.Share("k8sFileShare", {
    name: "k8s-file-share",
    storageAccountName: storageAccountK8s.name,
    quota: 10
});
export const fileShareName = fileShare.name;
export const fileShareUrl = pulumi.secret(fileShare.url);

// Create AKS Cluster
const k8sCluster = new azure.containerservice.KubernetesCluster("aksCluster", {
    resourceGroupName: resourceGroupName,
    kubernetesVersion: "1.17.3",
    location: stackLocation,
    defaultNodePool:{
        name: "aksagentpool",
        nodeCount: nodeCount,
        enableAutoScaling: false,
        vmSize: nodeSize
    },
    dnsPrefix: k8sDnsName,
    linuxProfile: {
        adminUsername: "aksuser",
        sshKey: { keyData: sshPublicKey }
    },
    servicePrincipal: {
        clientId: adAppId,
        clientSecret: password,
    }
}, {dependsOn: adSpPassword});

// Expose a k8s provider instance using our custom cluster instance.
const k8sProvider = new k8s.Provider("aksK8s", {
    kubeconfig: k8sCluster.kubeConfigRaw,
});

export const clusterName = k8sCluster.name;
export const kubeCtrlCredentialsCommand = pulumi.interpolate `az aks get-credentials --resource-group ${resourceGroupName} --name ${clusterName} --context "MyProject.Identity"`;

// Export the kubeconfig as a secret
export const kubeConfig = pulumi.secret(k8sCluster.kubeConfigRaw);

// Create secrets in **k8s** cluster to allow certain operations

// Docker Registry credentials
const acrInstanceName = pulumi.output("<snipped>")
const acrResourceGroup = config.requireSecret("acrResourceGroup");

//const acrIdentifier = config.requireSecret("acrIdentifier");
//const acrIdentifier:pulumi.Output<string> = pulumi
//    .all([subscriptionId, acrResourceGroup, acrInstanceName])
//    .apply(([a,b,c]) => `/subscriptions/${a}/resourceGroups/${b}/providers/Microsoft.ContainerRegistry/registries/${c}`);
//const acrIdentifier:pulumi.Output<string> = pulumi.interpolate `/subscriptions/${azure.config.subscriptionId}/resourceGroups/${acrResourceGroup}/providers/Microsoft.ContainerRegistry/registries/${acrInstanceName}`;
const acrIdentifier:pulumi.Output<string> =  pulumi.output("/subscriptions/<snipped>/resourceGroups/<snipped>/providers/Microsoft.ContainerRegistry/registries/<snipped>");

const privateACRInstance = azure.containerservice.Registry.get("<snipped>", acrIdentifier);

const k8sDockerSecret = helpers.createImagePullSecret(
    acrSecretName,
    privateACRInstance.adminUsername, 
    privateACRInstance.adminPassword, 
    privateACRInstance.loginServer,
    k8sProvider);


const azureStorageSecret = helpers.createAzureFileSecret(
    azureStorageSecretName,
    storageAccountName,
    storageAccountKeyPrimary,
    k8sProvider);