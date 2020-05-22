using System.Collections.Generic;

namespace MyProject.Admin.Api.Dtos.ApiResources
{
    public class ApiSecretsApiDto
    {
        public ApiSecretsApiDto()
        {
            ApiSecrets = new List<ApiSecretApiDto>();
        }

        public int TotalCount { get; set; }

        public int PageSize { get; set; }

        public List<ApiSecretApiDto> ApiSecrets { get; set; }
    }
}





