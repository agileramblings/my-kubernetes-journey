minikube start --vm-driver=hyperv --cpus=4 --memory=16g --extra-config=apiserver.service-node-port-range=80-33000

# Start a tunnel from your local machine into minikube and the kubernetes dashboard
# 127.0.0.1:<port> should open in a browser window for you and it should be the Kubernetes Web UI in minikube
Start-Process -NoNewWindow minikube dashboard 

# import the postgres deployment and service resources
kubectl create -f .\postgres-dep.yml --save-config
kubectl create -f .\postgres-svc.yml --save-config

# import the pgadmin4 deployment and service resources
kubectl create -f .\pgadmin4-dep.yml --save-config
kubectl create -f .\pgadmin4-svc.yml --save-config

# import the seq deployment and service resources
kubectl create -f .\seq-dep.yml --save-config
kubectl create -f .\seq-svc.yml --save-config

# expose the services in minikube
minikube service pgadmin4-svc
minikube service seq-svc

# edit your workstations host file to add minikube ip and DNS alias
$hostFileLocation = "C:\Windows\System32\drivers\etc\hosts"
$ip = minikube ip # put the $ip address in a variable
$localDnsEntry = "127.0.0.1.xip.io"
$dump =  Get-Content -Path $hostFileLocation
$hostFile = [List[string]] $dump
if($hostFile.Contains("# minikube section"))
{
    $hostFile.Remove("# minikube section");
    $hostFile.FindAll({param($line) $line.Contains($localDnsEntry)}) | ForEach-Object { $hostFile.Remove($_) }
    $hostFile.Remove("# minikube end section")
}
$hostFile.Add("# minikube section")
$hostFile.Add("$ip`t$localDnsEntry")
$hostFile.Add("# minikube end section")

Set-Content -path C:\Windows\System32\drivers\etc\hosts $hostFile

# set docker credentials secret
kubectl --namespace default create secret docker-registry docker-credentials `
--docker-server=<snipped>.azurecr.io `
--docker-username=<your acr username> `
--docker-password=<your acr password> `
--docker-email=admin@codingwithdave.xyz

# get the manifests into k8s
kubectl create -f .\identity-sts-dep.yml --save-config
kubectl create -f .\identity-sts-svc.yml --save-config
kubectl create -f .\identity-admin-dep.yml --save-config
kubectl create -f .\identity-admin-svc.yml --save-config
kubectl create -f .\identity-adminapi-dep.yml --save-config
kubectl create -f .\identity-adminapi-svc.yml --save-config

# expose the services in minikube
minikube service identity-sts-svc
minikube service identity-admin-svc
minikube service identity-admin-api-svc