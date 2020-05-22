import * as azure from "@pulumi/azure";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { storageAccountKeyPrimary } from ".";

export function createImagePullSecret(
    secretName: string,
    username: pulumi.Output<string>,
    password: pulumi.Output<string>, 
    registry : pulumi.Output<string>,
    k8sProvider : k8s.Provider): k8s.core.v1.Secret {

    // Put the username password into dockerconfigjson format.
    let base64JsonEncodedCredentials : pulumi.Output<string> = 
        pulumi.all([username, password, registry])
        .apply(([username, password, registry]) => {
            const base64Credentials = Buffer.from(username + ':' + password).toString('base64');
            const json =  `{"auths":{"${registry}":{"auth":"${base64Credentials}"}}}`;
            console.log(json);
            return Buffer.from(json).toString('base64');
        });

    return new k8s.core.v1.Secret(secretName, {
        metadata: {
            name: secretName,
        },
        type: 'kubernetes.io/dockerconfigjson',
        data: {
            ".dockerconfigjson": base64JsonEncodedCredentials,
        },
    }, { provider: k8sProvider });
};

export function createAzureFileSecret(
    secretName: string,
    storageAccountName: pulumi.Output<string>,
    storageAccountKey: pulumi.Output<string>, 
    k8sProvider : k8s.Provider): k8s.core.v1.Secret {

    let dataValue = pulumi
        .all([storageAccountName, storageAccountKey])
        .apply(([san,sak]) =>{
            const b64SAN = Buffer.from(san).toString('base64');
            const b64SAK = Buffer.from(sak).toString('base64');
            return { azurestorageaccountname: b64SAN, azurestorageaccountkey: b64SAK };
        }
    );
    
    return new k8s.core.v1.Secret(secretName, {
        type: "kubernetes.io/generic",
        metadata: {
            name: secretName,
            namespace: "default"
        },
        data: dataValue
    },{provider: k8sProvider});
};