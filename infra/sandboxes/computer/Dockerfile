FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    fluxbox \
    xterm \
    xdotool \
    x11-utils \
    x11-xserver-utils \
    novnc \
    websockify \
    python3 \
    ca-certificates \
    procps \
    bash \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    dbus-x11 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /etc/meshvault/fluxbox \
  && printf '%s\n' '#!/bin/sh' 'exec xsetroot -solid "#111113" "$@"' > /usr/bin/fbsetbg \
  && chmod +x /usr/bin/fbsetbg \
  && ln -sfn /bin/true /usr/bin/xmessage
ENV DISPLAY=:1
ENV HOME=/home/meshvault
WORKDIR /home/meshvault
COPY start.sh /usr/local/bin/meshvault-computer
COPY meshvault-browser /usr/local/bin/meshvault-browser
COPY fluxbox.init /etc/meshvault/fluxbox/init
COPY fluxbox.apps /etc/meshvault/fluxbox/apps
COPY fluxbox.menu /etc/meshvault/fluxbox/menu
COPY embed.html /usr/share/novnc/embed.html
RUN chmod +x /usr/local/bin/meshvault-computer /usr/local/bin/meshvault-browser
EXPOSE 6080
CMD ["/usr/local/bin/meshvault-computer"]
