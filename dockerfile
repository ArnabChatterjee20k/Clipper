FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code


COPY ./pyproject.toml /code/pyproject.toml
COPY ./app.py /code/app.py

RUN pip install uv

RUN uv pip install --no-cache-dir --upgrade -r /code/pyproject.toml --system

COPY ./app /code/app

# use build arg here to conditonally start prod
CMD ["fastapi", "dev", "app.py", "--host", "0.0.0.0", "--port", "8000"]