FROM mcr.microsoft.com/dotnet/core/aspnet:3.1-buster-slim AS base
WORKDIR /app
EXPOSE 80

FROM mcr.microsoft.com/dotnet/core/sdk:3.1-buster AS build
WORKDIR /src
COPY ["src/MyProject.STS.Identity/MyProject.STS.Identity.csproj", "src/MyProject.STS.Identity/"]
COPY ["src/MyProject.Admin.EntityFramework.Shared/MyProject.Admin.EntityFramework.Shared.csproj", "src/MyProject.Admin.EntityFramework.Shared/"]
COPY ["src/MyProject.Admin.EntityFramework.SqlServer/MyProject.Admin.EntityFramework.SqlServer.csproj", "src/MyProject.Admin.EntityFramework.SqlServer/"]
COPY ["src/MyProject.Admin.EntityFramework.PostgreSQL/MyProject.Admin.EntityFramework.PostgreSQL.csproj", "src/MyProject.Admin.EntityFramework.PostgreSQL/"]
COPY ["src/MyProject.Admin.EntityFramework.MySql/MyProject.Admin.EntityFramework.MySql.csproj", "src/MyProject.Admin.EntityFramework.MySql/"]
RUN dotnet restore "src/MyProject.STS.Identity/MyProject.STS.Identity.csproj"
COPY . .
WORKDIR "/src/src/MyProject.STS.Identity"
RUN dotnet build "MyProject.STS.Identity.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "MyProject.STS.Identity.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
ENTRYPOINT ["dotnet", "MyProject.STS.Identity.dll"]