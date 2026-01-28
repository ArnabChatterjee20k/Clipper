FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code


COPY ./pyproject.toml /code/pyproject.toml
COPY ./app.py /code/app.py
COPY ./consumers.py /code/consumers.py

RUN pip install uv

RUN uv pip install --no-cache-dir --upgrade -r /code/pyproject.toml --system

COPY ./modules /code/modules
COPY ./presets /code/presets

# use build arg here to conditonally start prod
ENTRYPOINT ["tail", "-f", "/dev/null"]
