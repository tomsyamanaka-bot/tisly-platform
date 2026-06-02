# Mosquitto password file

```bash
# Create password file (first user)
sudo mosquitto_passwd -c /etc/mosquitto/passwd tisly-server

# Add device user (no -c flag)
sudo mosquitto_passwd /etc/mosquitto/passwd ESP-GATE-001

# Reload
sudo systemctl reload mosquitto
```

- One MQTT user per `device_id` recommended
- Never commit `/etc/mosquitto/passwd` to git
- Pair with `aclfile.example` per device
