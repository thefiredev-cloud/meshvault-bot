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
  && mkdir -p /etc/meshbot/fluxbox \
  && printf '%s\n' '#!/bin/sh' 'exec xsetroot -solid "#111113" "$@"' > /usr/bin/fbsetbg \
  && chmod +x /usr/bin/fbsetbg \
  && ln -sfn /bin/true /usr/bin/xmessage
ENV DISPLAY=:1
ENV HOME=/home/meshbot
WORKDIR /home/meshbot
COPY start.sh /usr/local/bin/meshbot-computer
COPY meshbot-browser /usr/local/bin/meshbot-browser
COPY fluxbox.init /etc/meshbot/fluxbox/init
COPY fluxbox.apps /etc/meshbot/fluxbox/apps
COPY fluxbox.menu /etc/meshbot/fluxbox/menu
COPY embed.html /usr/share/novnc/embed.html
RUN chmod +x /usr/local/bin/meshbot-computer /usr/local/bin/meshbot-browser
EXPOSE 6080
CMD ["/usr/local/bin/meshbot-computer"]
