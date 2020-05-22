# Passphrase Authorization Setup

In order to control how secrets are encrypted in Pulumi, we have some options. I'm showing passphrase and Azure KeyVault options here, but I wasn't able to get the KeyVault option working. These steps should work, but they currently don't. I'll leave them here and edit them when I get them working.

## Passphrase

This is a pretty simple setup. The the following **environmental variable** to your desired password.

`$Env:PULUMI_CONFIG_PASSPHRASE = 'P@ssw0rd!'`

You do not need to set the EnvVar. If you do not set the EnvVar, you will be challenged for the password as needed.

### Create a new stack using this Secrets Provider

`pulumi stack init dev --secrets-provider=passphrase`

## KeyVault Authorization Setup

In order to make consistently accessible secrets across stacks, an external secret provider must be setup so that each stack will use that instead of the built-in per-stack secret provider that Pulumi uses by default.

These steps will create a file in your current directory, using the logged-in user context for `az`, create a .ps1 script to set the required Environmental Variable, and make sure your .auth file is not uploaded to git. This is based off of the instructions provided [here](https://docs.microsoft.com/en-us/azure/developer/go/azure-sdk-authorization#use-file-based-authentication).

### Steps

1. Run the following command to create an azure.auth file
    - `az ad sp create-for-rbac --sdk-auth > azure.auth`
1. Create a powershell script named Set-EnvVar.ps1
    - Put this line of code in the script file<br/>
      `$Env:AZURE_AUTH_LOCATION  = (Get-ChildItem azure.auth).FullName`
1. In the local `.gitignore` file, add this line
    - `**.auth`

When you begin to work on this application, you will need to run the .ps1 script before running `pulumi up` for the first time.

### Create a new stack using this Secrets Provider

Create a KeyVault and put the location in the command line below

`pulumi stack init dev --secrets-provider="azurekeyvault://<url>.vault.azure.net/keys/pulumi"`
