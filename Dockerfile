FROM python:3.12-slim

WORKDIR /app

# System dependencies:
#  - default-libmysqlclient-dev + pkg-config + gcc: required to build the
#    mysqlclient Python package against MySQL's C client library.
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev \
    pkg-config \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x docker/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["docker/entrypoint.sh"]
