using System.Collections.Generic;

namespace MyProject.Admin.Api.Dtos.Users
{
    public class UserProvidersApiDto<TUserDtoKey>
    {
        public UserProvidersApiDto()
        {
            Providers = new List<UserProviderApiDto<TUserDtoKey>>();
        }

        public List<UserProviderApiDto<TUserDtoKey>> Providers { get; set; }
    }
}





